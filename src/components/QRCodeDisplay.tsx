import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  uri: string;
  secret: string;
}

const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ uri, secret }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, uri, { errorCorrectionLevel: 'M' })
      .catch(() => setRenderError(true));
  }, [uri]);

  return (
    <div className="flex flex-col items-center gap-3">
      {renderError ? (
        <p className="text-sm text-gray-500 break-all">{uri}</p>
      ) : (
        <canvas ref={canvasRef} />
      )}
      <div className="text-center">
        <p className="text-xs text-gray-500 mb-1">Manual entry key:</p>
        <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded break-all">{secret}</code>
      </div>
    </div>
  );
};

export default QRCodeDisplay;
