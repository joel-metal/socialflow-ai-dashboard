/**
 * Twitter API mock helpers using nock.
 *
 * Usage:
 *   import { mockTwitter } from '../mocks/twitterMock';
 *   mockTwitter.postTweet.success();   // intercepts POST /2/tweets once
 *   mockTwitter.postTweet.rateLimited(); // returns 429
 */
import nock from 'nock';

const BASE = 'https://api.twitter.com';

function scope() {
  return nock(BASE).matchHeader('authorization', /^Bearer /);
}

export const mockTwitter = {
  /** POST /2/tweets */
  postTweet: {
    success: (tweet = { id: 'tweet-1', text: 'Hello world', created_at: '2026-01-01T00:00:00Z', author_id: 'user-1' }) =>
      scope().post('/2/tweets').reply(201, { data: tweet }),

    error: (status = 400, message = 'Bad Request') =>
      scope().post('/2/tweets').reply(status, { errors: [{ message }] }),

    rateLimited: () =>
      scope().post('/2/tweets').reply(429, { title: 'Too Many Requests' }),

    serverError: () =>
      scope().post('/2/tweets').reply(500, { title: 'Internal Server Error' }),
  },

  /** GET /2/users/:id/tweets */
  getUserTimeline: {
    success: (userId: string, tweets: any[] = []) =>
      scope()
        .get(`/2/users/${userId}/tweets`)
        .query(true)
        .reply(200, { data: tweets }),

    empty: (userId: string) =>
      scope().get(`/2/users/${userId}/tweets`).query(true).reply(200, { data: [] }),

    rateLimited: (userId: string) =>
      scope().get(`/2/users/${userId}/tweets`).query(true).reply(429, { title: 'Too Many Requests' }),
  },

  /** GET /2/users/by/username/:username */
  getUserInfo: {
    success: (username: string, user = { id: 'user-1', username, name: 'Test User' }) =>
      scope()
        .get(`/2/users/by/username/${username}`)
        .query(true)
        .reply(200, { data: user }),

    notFound: (username: string) =>
      scope()
        .get(`/2/users/by/username/${username}`)
        .query(true)
        .reply(404, { errors: [{ message: 'User not found' }] }),
  },

  /** GET /2/tweets/search/recent */
  searchTweets: {
    success: (tweets: any[] = []) =>
      scope().get('/2/tweets/search/recent').query(true).reply(200, { data: tweets }),

    rateLimited: () =>
      scope().get('/2/tweets/search/recent').query(true).reply(429, { title: 'Too Many Requests' }),
  },

  /** GET /2/users/me */
  healthCheck: {
    ok: () => scope().get('/2/users/me').reply(200, { data: { id: 'me' } }),
    fail: () => scope().get('/2/users/me').reply(401, { title: 'Unauthorized' }),
  },
};
