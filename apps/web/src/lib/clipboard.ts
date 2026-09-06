/**
 * Copying text in the browsers people actually open NADA in.
 *
 * `navigator.clipboard` is the right API, but it is absent or throws in the
 * places a link to an anonymous messenger tends to get opened: in-app webviews
 * (Instagram, TikTok, Telegram), pages served over plain HTTP on a LAN, and
 * Safari when the write happens a tick too late to still count as a user
 * gesture. The seed phrase is the one string a user cannot afford to fail to
 * copy, so fall back to the legacy selection path rather than silently doing
 * nothing.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or non-secure context — try the legacy path below.
    }
  }

  return copyViaSelection(text);
}

/**
 * The pre-Clipboard-API path: put the text in an off-screen field, select it,
 * and let `execCommand("copy")` lift the selection. Deprecated, still the only
 * thing that works in older iOS webviews.
 */
function copyViaSelection(text: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  // Off-screen, but still rendered and focusable: iOS refuses to copy from a
  // node that is `display: none` or `visibility: hidden`. The 16px font size
  // stops Safari zooming the page when the field takes focus.
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.width = "1px";
  field.style.height = "1px";
  field.style.padding = "0";
  field.style.border = "none";
  field.style.opacity = "0";
  field.style.fontSize = "16px";
  document.body.appendChild(field);

  try {
    if (isIOS()) {
      // iOS ignores `select()` on a readonly field; a range over an editable
      // node is the only selection it will copy from.
      field.contentEditable = "true";
      field.readOnly = false;
      const range = document.createRange();
      range.selectNodeContents(field);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    field.focus();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  // iPadOS reports itself as a Mac; the touch points give it away.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
