import type { Session, WebContents } from 'electron';

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

export function configureSessionSecurity(session: Session, isPackaged: boolean): void {
  session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  session.setPermissionCheckHandler(() => false);

  if (isPackaged) {
    session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [PRODUCTION_CSP],
        },
      });
    });
  }
}

export function restrictWindowNavigation(webContents: WebContents): void {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== webContents.getURL()) {
      event.preventDefault();
    }
  });
}
