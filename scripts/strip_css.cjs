const fs = require('fs');
const postcss = require('postcss');

const cssPath = 'apps/web/app/globals.css';
const cssContent = fs.readFileSync(cssPath, 'utf8');
const classArray = [
"tsx", "nada-desktop-layout", "n-revealed", "rounded-t-inherit", "n-bubble-sent", "n-bubble-recv", "n-terminal", "n-bubble-new", "n-whisper-in", "n-bubble-sent-anim", "n-dissolve", "n-hairline", "n-inner-light", "n-skeleton", "nada-rail-avatar", "nada-sidebar-header", "nada-sidebar-title", "nada-sidebar-actions", "nada-search-container", "nada-search", "nada-filters", "nada-filter-chip", "nada-filter-pill", "nada-filter-pill-active", "nada-chat-list", "nada-avatar-initials", "nada-avatar-sm", "nada-avatar-lg", "nada-conversation", "nada-wallpaper", "nada-wallpaper-doodle", "nada-messages", "nada-bubble-text", "nada-bubble-meta", "nada-bubble-time", "nada-tick", "nada-reply-preview-name", "nada-reply-preview-text", "nada-reaction-row", "nada-reaction-count", "nada-date-separator", "nada-system-msg", "nada-system-msg-text", "nada-voice-note", "nada-vn-play", "nada-vn-waveform", "nada-vn-bar", "nada-vn-time", "nada-vn-speed", "nada-file-card", "nada-file-info", "nada-file-name", "nada-file-size", "nada-chat-composer", "nada-composer-input", "nada-composer-actions", "nada-send-btn", "nada-community-layout", "nada-community-header", "nada-community-cover", "nada-community-info", "nada-community-title", "nada-community-members", "nada-community-description", "nada-community-tabs", "nada-community-tab", "nada-community-tab-active", "nada-community-content", "nada-post-card", "nada-post-header", "nada-post-author", "nada-post-time", "nada-post-body", "nada-post-footer", "nada-post-action", "nada-post-action-count", "nada-status-header", "nada-status-progress", "nada-status-segment", "nada-status-segment-active", "nada-status-content", "nada-status-text", "nada-status-footer", "nada-status-input", "nada-panel", "nada-panel-header", "nada-panel-title", "nada-panel-content", "nada-list", "nada-list-item", "nada-list-item-content", "nada-list-item-title", "nada-list-item-subtitle", "nada-list-item-action", "nada-toggle", "nada-toggle-track", "nada-toggle-thumb", "nada-toggle-on", "nada-btn", "nada-btn-primary", "nada-btn-secondary", "nada-btn-danger", "nada-btn-ghost", "nada-input-field", "nada-input-label", "nada-modal-overlay", "nada-modal", "nada-modal-title", "nada-modal-description", "nada-modal-actions", "nada-toast", "nada-toast-success", "nada-toast-error"
];

const plugin = postcss.plugin('strip-unused', () => {
  return (root) => {
    root.walkRules(rule => {
      // Check if any of the selectors in this rule use an unused class
      const selectors = rule.selectors.filter(sel => {
        return !classArray.some(cls => sel.includes('.' + cls));
      });
      
      if (selectors.length === 0) {
        rule.remove();
      } else {
        rule.selectors = selectors;
      }
    });
  };
});

postcss([plugin]).process(cssContent, { from: cssPath, to: cssPath }).then(result => {
  fs.writeFileSync(cssPath, result.css);
  console.log('Stripped unused CSS successfully.');
});
