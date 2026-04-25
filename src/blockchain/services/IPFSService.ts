import { AppError } from '../../utils/AppError';
import { ErrorCode } from '../../constants/ErrorCodes';

/* IPFSService
   Provides upload/download/pinning/caching helper for IPFS providers
*/

type Provider = 'pinata' | 'web3'

export interface IPFSConfig {
  provider: Provider
  apiKey?: string
  secret?: string
  gatewayUrls: string[]
}

export interface IPFSUploadResult {
  cid: string
  size: number
  gatewayUrl: string
}

const DEFAULT_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://dweb.link/ipfs/',
]

const MB = 1024 * 1024

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function retryWithBackoff<T>(fn: () => Promise<T>, attempts = 3, baseMs = 300) {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const wait = baseMs * 2 ** i
      await sleep(wait)
    }
  }
  throw lastErr
}

function timeoutSignal(timeoutMs: number) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

// Basic IndexedDB helpers
function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('ipfs-cache-db', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'cid' })
      if (!db.objectStoreNames.contains('pins')) db.createObjectStore('pins', { keyPath: 'cid' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(storeName: string, value: any) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet(storeName: string, key: string) {
  const db = await openDb()
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbAll(storeName: string) {
  const db = await openDb()
  return new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete(storeName: string, key: string) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export class IPFSService {
  config: IPFSConfig

  constructor(config?: Partial<IPFSConfig>) {
    const fromEnv = IPFSService.fromEnv()
    this.config = {
      provider: config?.provider || fromEnv.provider,
      apiKey: config?.apiKey || fromEnv.apiKey,
      secret: config?.secret || fromEnv.secret,
      gatewayUrls: config?.gatewayUrls || fromEnv.gatewayUrls || DEFAULT_GATEWAYS,
    }
  }

  static fromEnv(): IPFSConfig {
    // Vite env variables (client-side) usually accessible via import.meta.env
    // We attempt to read both import.meta.env and window.__ENV__ fallback
    // but keep this minimal — consumers can pass config directly.
    // @ts-ignore
    const env = typeof import.meta !== 'undefined' ? import.meta.env : (window as any).__ENV__ || {}
    const pinataKey = env.VITE_PINATA_API_KEY || env.VITE_PINATA_JWT
    const web3Key = env.VITE_WEB3_STORAGE_TOKEN
    const provider: Provider = web3Key ? 'web3' : pinataKey ? 'pinata' : 'web3'
    return {
      provider,
      apiKey: web3Key || pinataKey,
      secret: env.VITE_PINATA_SECRET || undefined,
      gatewayUrls: DEFAULT_GATEWAYS,
    }
  }

  // Helper to pick provider URL and auth
  private getProviderInfo() {
    if (this.config.provider === 'web3') {
      return {
        uploadUrl: 'https://api.web3.storage/upload',
        listUrl: 'https://api.web3.storage/user/uploads',
        authHeader: this.config.apiKey ? `Bearer ${this.config.apiKey}` : undefined,
      }
    }
    return {
      uploadUrl: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
      pinByHashUrl: 'https://api.pinata.cloud/pinning/pinByHash',
      listUrl: 'https://api.pinata.cloud/data/pinList',
      authHeader: this.config.apiKey && this.config.secret ? undefined : this.config.apiKey, // if JWT stored in apiKey
    }
  }

  async uploadFile(
    file: File,
    onProgress?: (uploadedBytes: number, totalBytes: number) => void
  ): Promise<IPFSUploadResult> {
    const size = file.size
    const chunkThreshold = 10 * MB
    if (size > chunkThreshold) {
      return this.uploadFileChunked(file, onProgress)
    }
    return this.uploadFileSimple(file, onProgress)
  }

  private async uploadFileSimple(file: File, _onProgress?: (a: number, b: number) => void) {
    const info = this.getProviderInfo()
    if (this.config.provider === 'web3') {
      const form = new FormData()
      form.append('file', file, file.name)
      const res = await retryWithBackoff(() => fetch(info.uploadUrl!, { method: 'POST', headers: { Authorization: info.authHeader || '' }, body: form }), 3)
      if (!res.ok) throw new AppError(ErrorCode.ERR_NETWORK_ERROR, `Upload failed ${res.status}`)
      const data = await res.json()
      // web3.storage returns cid in `cid`
      const cid = data.cid || (data[0] && data[0].cid) || ''
      const gatewayUrl = this.getFileUrl(cid)
      return { cid, size: file.size, gatewayUrl }
    } else {
      // Pinata
      const form = new FormData()
      form.append('file', file, file.name)
      const headers: any = {}
      if (this.config.apiKey && this.config.secret) {
        headers['pinata_api_key'] = this.config.apiKey
        headers['pinata_secret_api_key'] = this.config.secret
      } else if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`
      }
      const res = await retryWithBackoff(() => fetch(info.uploadUrl!, { method: 'POST', headers, body: form }), 3)
      if (!res.ok) throw new AppError(ErrorCode.ERR_NETWORK_ERROR, `Upload failed ${res.status}`)
      const data = await res.json()
      const cid = data.IpfsHash || data.ipfsHash || ''
      const gatewayUrl = this.getFileUrl(cid)
      return { cid, size: file.size, gatewayUrl }
    }
  }

  private async uploadFileChunked(file: File, onProgress?: (a: number, b: number) => void) {
    // Stream file in slices using ReadableStream and send to provider when possible
    const chunkSize = 5 * MB
    let uploaded = 0

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const start = uploaded
        if (start >= file.size) {
          controller.close()
          return
        }
        const end = Math.min(start + chunkSize, file.size)
        const blob = file.slice(start, end)
        const arr = new Uint8Array(await blob.arrayBuffer())
        controller.enqueue(arr)
        uploaded = end
        if (onProgress) onProgress(uploaded, file.size)
      },
    })

    const info = this.getProviderInfo()
    const headers: any = {}
    if (this.config.provider === 'web3') {
      if (info.authHeader) headers['Authorization'] = info.authHeader
      headers['Content-Type'] = 'application/octet-stream'
      const res = await retryWithBackoff(() => fetch(info.uploadUrl!, { method: 'POST', headers, body: stream as any }), 3)
      if (!res.ok) throw new AppError(ErrorCode.ERR_NETWORK_ERROR, `Upload failed ${res.status}`)
      const data = await res.json()
      const cid = data.cid || ''
      return { cid, size: file.size, gatewayUrl: this.getFileUrl(cid) }
    } else {
      // Pinata doesn't accept raw streaming in this form; fallback to simple upload
      return this.uploadFileSimple(file, onProgress)
    }
  }

  async uploadJSON(metadata: any): Promise<{ cid: string; uri: string }> {
    // Validate JSON: must be object
    if (typeof metadata !== 'object' || metadata === null) throw new AppError(ErrorCode.ERR_BAD_REQUEST, 'Invalid metadata')
    const info = this.getProviderInfo()
    if (this.config.provider === 'web3') {
      const headers: any = { Authorization: info.authHeader || '', 'Content-Type': 'application/json' }
      const res = await retryWithBackoff(() => fetch(info.uploadUrl!, { method: 'POST', headers, body: JSON.stringify(metadata) }), 3)
      if (!res.ok) throw new Error('JSON upload failed')
      const data = await res.json()
      const cid = data.cid || ''
      return { cid, uri: `ipfs://${cid}` }
    } else {
      // Pinata JSON pinning endpoint
      const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS'
      const headers: any = { 'Content-Type': 'application/json' }
      if (this.config.apiKey && this.config.secret) {
        headers['pinata_api_key'] = this.config.apiKey
        headers['pinata_secret_api_key'] = this.config.secret
      } else if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`
      }
      const res = await retryWithBackoff(() => fetch(url, { method: 'POST', headers, body: JSON.stringify(metadata) }), 3)
      if (!res.ok) throw new Error('JSON upload failed')
      const data = await res.json()
      const cid = data.IpfsHash || data.ipfsHash || ''
      return { cid, uri: `ipfs://${cid}` }
    }
  }

  async uploadBatch(files: File[], onProgress?: (completed: number, total: number) => void) {
    const concurrency = 3
    const results: IPFSUploadResult[] = []
    let index = 0
    let completed = 0

    const runOne = async () => {
      while (index < files.length) {
        const i = index++
        try {
          const res = await this.uploadFile(files[i], (_u, _t) => {
            // per-file progress ignored here
          })
          results[i] = res
        } catch (e) {
          results[i] = { cid: '', size: files[i].size, gatewayUrl: '' }
        }
        completed++
        if (onProgress) onProgress(completed, files.length)
      }
    }

    const workers = []
    for (let i = 0; i < concurrency; i++) workers.push(runOne())
    await Promise.all(workers)
    return results
  }

  getFileUrl(cid: string) {
    const gw = (this.config.gatewayUrls && this.config.gatewayUrls[0]) || DEFAULT_GATEWAYS[0]
    return gw + cid
  }

  private async fetchWithGatewayFallback(cid: string, timeoutMs = 30_000): Promise<Response> {
    const gateways = this.config.gatewayUrls || DEFAULT_GATEWAYS
    let lastErr: any
    for (const gw of gateways) {
      const url = gw + cid
      const { signal, clear } = timeoutSignal(timeoutMs)
      try {
        const res = await fetch(url, { signal })
        clear()
        if (res.ok) return res
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr || new AppError(ErrorCode.ERR_NETWORK_ERROR, 'All gateways failed')
  }

  async getFile(cid: string): Promise<Blob> {
    const cached = await idbGet('files', cid)
    if (cached && cached.data) {
      // update access time
      await idbPut('files', { ...cached, lastAccess: Date.now() })
      return new Blob([cached.data])
    }
    const res = await this.fetchWithGatewayFallback(cid)
    const blob = await res.blob()
    await this.cacheFile(cid, blob)
    return blob
  }

  async getJSON(cid: string): Promise<any> {
    const res = await this.fetchWithGatewayFallback(cid)
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new AppError(ErrorCode.ERR_INVALID_FORMAT, 'Invalid JSON')
    }
  }

  // Caching
  async cacheFile(cid: string, blob: Blob) {
    const size = blob.size
    const data = await blob.arrayBuffer()
    const entry = { cid, data, size, lastAccess: Date.now() }
    await idbPut('files', entry)
    await this.enforceCacheLimit()
  }

  async getCacheSize() {
    const all = await idbAll('files')
    return all.reduce((s, e) => s + (e.size || 0), 0)
  }

  async clearCache() {
    const db = await openDb()
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite')
      tx.objectStore('files').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private async enforceCacheLimit() {
    const limit = 500 * MB
    const all = await idbAll('files')
    let total = all.reduce((s, e) => s + (e.size || 0), 0)
    if (total <= limit) return
    // sort by lastAccess ascending (oldest first)
    all.sort((a, b) => (a.lastAccess || 0) - (b.lastAccess || 0))
    for (const entry of all) {
      const pin = await idbGet('pins', entry.cid)
      if (pin?.pinned) continue
      await idbDelete('files', entry.cid)
      total -= entry.size || 0
      if (total <= limit) break
    }
  }

  // Pinning management
  async pinFile(cid: string) {
    const info = this.getProviderInfo()
    if (this.config.provider === 'pinata') {
      const url = info.pinByHashUrl!
      const headers: any = { 'Content-Type': 'application/json' }
      if (this.config.apiKey && this.config.secret) {
        headers['pinata_api_key'] = this.config.apiKey
        headers['pinata_secret_api_key'] = this.config.secret
      } else if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`
      }
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ hashToPin: cid }) })
      if (!res.ok) throw new AppError(ErrorCode.ERR_TRANSACTION_FAILED, 'Pin failed')
      await idbPut('pins', { cid, pinned: true, provider: 'pinata', updatedAt: Date.now() })
      return true
    } else {
      // web3.storage pins at upload time; we store a local pin record
      await idbPut('pins', { cid, pinned: true, provider: 'web3', updatedAt: Date.now() })
      return true
    }
  }

  async unpinFile(cid: string) {
    
    if (this.config.provider === 'pinata') {
      const url = `https://api.pinata.cloud/pinning/unpin/${cid}`
      const headers: any = {}
      if (this.config.apiKey && this.config.secret) {
        headers['pinata_api_key'] = this.config.apiKey
        headers['pinata_secret_api_key'] = this.config.secret
      } else if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`
      const res = await fetch(url, { method: 'DELETE', headers })
      if (!res.ok) throw new AppError(ErrorCode.ERR_TRANSACTION_FAILED, 'Unpin failed')
      await idbPut('pins', { cid, pinned: false, provider: 'pinata', updatedAt: Date.now() })
      return true
    } else {
      // web3: best-effort local unpin record
      await idbPut('pins', { cid, pinned: false, provider: 'web3', updatedAt: Date.now() })
      return true
    }
  }

  async getPinnedFiles() {
    // return combined local records and remote if available
    const local = await idbAll('pins')
    const info = this.getProviderInfo()
    let remote: any[] = []
    try {
      if (this.config.provider === 'web3') {
        const res = await fetch(info.listUrl!, { headers: { Authorization: info.authHeader || '' } })
        if (res.ok) remote = await res.json()
      } else {
        const url = `${info.listUrl}?status=pinned`
        const headers: any = {}
        if (this.config.apiKey && this.config.secret) {
          headers['pinata_api_key'] = this.config.apiKey
          headers['pinata_secret_api_key'] = this.config.secret
        } else if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`
        const res = await fetch(url, { headers })
        if (res.ok) remote = await res.json()
      }
    } catch (e) {
      // ignore remote failures
    }
    return { local, remote }
  }
}

const ipfsService = new IPFSService()
export default ipfsService
