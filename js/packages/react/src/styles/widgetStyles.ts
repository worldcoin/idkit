export const WIDGET_STYLES = `
@font-face {
  font-family: 'TWK Lausanne';
  src: url('https://world-id-assets.com/fonts/TWKLausanne-200.woff2') format('woff2');
  font-weight: 200;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'TWK Lausanne';
  src: url('https://world-id-assets.com/fonts/TWKLausanne-300.woff2') format('woff2');
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'TWK Lausanne';
  src: url('https://world-id-assets.com/fonts/TWKLausanne-400.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'TWK Lausanne';
  src: url('https://world-id-assets.com/fonts/TWKLausanne-500.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'TWK Lausanne';
  src: url('https://world-id-assets.com/fonts/TWKLausanne-600.woff2') format('woff2');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

/* CSS Custom Properties */
:host {
  --idkit-font: 'TWK Lausanne', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --idkit-bg: #ffffff;
  --idkit-text: #0d151d;
  --idkit-text-muted: #657080;
  --idkit-text-secondary: #9eafc0;
  --idkit-border: #EBECEF;
  --idkit-border-light: #f1f5f8;
  --idkit-surface: #f8fafc;
  --idkit-success: #00C230;
  --idkit-error: #9BA3AE;
  --idkit-warning: #FFAE00;
  --idkit-btn-bg: #0d151d;
  --idkit-btn-text: #ffffff;
}
:host(.dark) {
  --idkit-bg: #0d151d;
  --idkit-text: #ffffff;
  --idkit-text-muted: #9eafc0;
  --idkit-text-secondary: #657080;
  --idkit-border: rgba(235, 236, 239, 0.15);
  --idkit-border-light: rgba(241, 245, 248, 0.1);
  --idkit-surface: rgba(255, 255, 255, 0.05);
  --idkit-btn-bg: #ffffff;
  --idkit-btn-text: #0d151d;
}

/* Animations */
@keyframes idkit-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes idkit-scale-in {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes idkit-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
@keyframes idkit-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes idkit-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Backdrop */
.idkit-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483646;
  padding: 16px;
  animation: idkit-fade-in 0.2s ease-out;
}

/* Modal */
.idkit-modal {
  position: relative;
  width: 100%;
  max-width: 448px;
  min-height: 35rem;
  background: var(--idkit-bg);
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.04);
  font-family: var(--idkit-font);
  color: var(--idkit-text);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: idkit-scale-in 0.25s ease-out;
}

/* Close button */
.idkit-close {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1.2px solid var(--idkit-border);
  border-radius: 50%;
  background: transparent;
  color: var(--idkit-text);
  cursor: pointer;
  padding: 0;
  z-index: 1;
  transition: background 0.15s ease;
}
.idkit-close:hover {
  background: var(--idkit-surface);
}
.idkit-close svg {
  width: 18px;
  height: 18px;
}

/* Content area */
.idkit-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 32px 24px;
  text-align: center;
}

/* Footer */
.idkit-footer {
  border-top: 1px solid var(--idkit-border);
  padding: 16px 32px;
  text-align: center;
}
.idkit-footer a {
  color: var(--idkit-text-muted);
  font-size: 13px;
  text-decoration: none;
  transition: color 0.15s ease;
}
.idkit-footer a:hover {
  color: var(--idkit-text);
}

/* World ID State */
.idkit-worldid-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1.2px solid var(--idkit-border);
  margin-bottom: 16px;
}
.idkit-worldid-icon svg {
  width: 32px;
  height: 32px;
  color: var(--idkit-text);
}

.idkit-heading {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--idkit-text);
}

.idkit-subtext {
  margin: 12px 0 0;
  font-size: 16px;
  line-height: 1.4;
  color: var(--idkit-text-muted);
}

/* QR Container */
.idkit-qr-container {
  position: relative;
  width: 100%;
  margin-top: 20px;
}

.idkit-qr-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  z-index: 2;
}

.idkit-qr-blur {
  transition: filter 0.5s ease-in-out, opacity 0.5s ease-in-out;
}
.idkit-qr-blur.blurred {
  filter: blur(16px);
  opacity: 0.4;
}

.idkit-qr-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  border: 1px solid var(--idkit-border-light);
  padding: 12px;
}

.idkit-qr-inner {
  color: var(--idkit-text);
}

/* QR Code SVG colors for finder patterns */
.idkit-qr-inner .qr-finder-dark { color: #000000; }
.idkit-qr-inner .qr-finder-light { color: #ffffff; }
:host(.dark) .idkit-qr-inner .qr-finder-dark { color: #000000; }
:host(.dark) .idkit-qr-inner .qr-finder-light { color: #ffffff; }
.idkit-qr-inner .qr-dot { color: #000000; }
:host(.dark) .idkit-qr-inner .qr-dot { color: #ffffff; }

/* QR Placeholder */
.idkit-qr-placeholder {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.idkit-qr-placeholder svg {
  width: 200px;
  height: 200px;
  animation: idkit-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Copy toast */
.idkit-copy-toast {
  display: grid;
  justify-items: center;
  transition: grid-template-rows 0.4s ease-in-out, opacity 0.25s ease-in-out, margin-top 0.4s ease-in-out;
}
.idkit-copy-toast.hidden {
  grid-template-rows: 0fr;
  opacity: 0;
  margin-top: 0;
}
.idkit-copy-toast.visible {
  grid-template-rows: 1fr;
  opacity: 1;
  margin-top: 8px;
  margin-bottom: 8px;
  transition: grid-template-rows 0.25s ease-in-out, opacity 0.2s ease-in-out 0.05s, margin-top 0.25s ease-in-out;
}
.idkit-copy-toast > span {
  overflow: hidden;
  display: block;
  border-radius: 8px;
  border: 1px solid var(--idkit-border-light);
  padding: 4px 8px;
  font-size: 14px;
  color: var(--idkit-text-secondary);
}

/* Mobile deep-link button */
.idkit-deeplink-btn {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border-radius: 16px;
  border: 1px solid transparent;
  background: var(--idkit-btn-bg);
  color: var(--idkit-btn-text);
  padding: 16px;
  font-family: var(--idkit-font);
  font-size: 16px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.idkit-deeplink-btn svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.idkit-deeplink-btn span {
  flex: 1;
  text-align: center;
}

/* Loading spinner */
.idkit-spinner {
  animation: idkit-spin 1s linear infinite;
}
.idkit-spinner svg {
  width: 24px;
  height: 24px;
}

.idkit-connecting-text {
  text-align: center;
}
.idkit-connecting-text p:first-child {
  font-weight: 500;
  color: var(--idkit-text-muted);
  margin: 0;
}
.idkit-connecting-text p:last-child {
  font-size: 14px;
  font-weight: 300;
  color: var(--idkit-text-muted);
  margin: 4px 0 0;
}

/* Success State */
.idkit-success-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}
.idkit-success-icon svg {
  width: 96px;
  height: 96px;
}

/* Error State */
.idkit-error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}
.idkit-error-icon svg {
  width: 96px;
  height: 96px;
}

.idkit-error-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--idkit-text);
}

.idkit-error-message {
  margin: 8px auto 0;
  max-width: 260px;
  font-size: 16px;
  color: var(--idkit-text-muted);
  line-height: 1.4;
}

/* Retry button */
.idkit-retry-btn {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  border: 1.2px solid var(--idkit-border);
  background: transparent;
  padding: 12px 32px;
  font-family: var(--idkit-font);
  font-size: 16px;
  font-weight: 600;
  color: var(--idkit-text);
  cursor: pointer;
  transition: box-shadow 0.3s ease;
  margin-top: 32px;
}
.idkit-retry-btn:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* Responsive: mobile full-screen bottom-anchored */
@media (max-width: 1024px) {
  .idkit-backdrop {
    align-items: flex-end;
    padding: 0;
  }
  .idkit-modal {
    max-width: 100%;
    min-height: auto;
    max-height: 95vh;
    border-radius: 24px 24px 0 0;
    animation: idkit-slide-up 0.3s ease-out;
  }

  /* Hide desktop QR on mobile */
  .idkit-desktop-only {
    display: none;
  }
  .idkit-mobile-only {
    display: block;
  }
}

@media (min-width: 1025px) {
  .idkit-mobile-only {
    display: none;
  }
  .idkit-desktop-only {
    display: block;
  }
}
`;
