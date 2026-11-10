import { describe, it, expect, beforeEach } from 'vitest';
import api from '../api/client';
import type { InternalAxiosRequestConfig } from 'axios';
import { AxiosHeaders } from 'axios';

describe('Axios API Client Configuration', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('configures baseURL with /api/v1 prefix', () => {
    expect(api.defaults.baseURL).toBe('/api/v1');
  });

  it('injects Authorization Bearer header when token is stored', async () => {
    const testToken = 'jwt-token-12345';
    localStorage.setItem('lastword_access_token', testToken);

    // Get the request interceptor handler
    const interceptor = api.interceptors.request;
    // @ts-expect-error accessing internal handlers for testing
    const handler = interceptor.handlers[0]?.fulfilled;
    expect(handler).toBeDefined();

    const config: InternalAxiosRequestConfig = {
      headers: new AxiosHeaders(),
    };

    const result = (await handler(config)) as InternalAxiosRequestConfig;
    expect(result.headers.Authorization).toBe(`Bearer ${testToken}`);
  });

  it('omits Authorization header when no token is present', async () => {
    const interceptor = api.interceptors.request;
    // @ts-expect-error accessing internal handlers for testing
    const handler = interceptor.handlers[0]?.fulfilled;
    expect(handler).toBeDefined();

    const config: InternalAxiosRequestConfig = {
      headers: new AxiosHeaders(),
    };

    const result = (await handler(config)) as InternalAxiosRequestConfig;
    expect(result.headers.Authorization).toBeUndefined();
  });
});
