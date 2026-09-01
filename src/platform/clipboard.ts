function isCep(): boolean {
  return typeof window !== "undefined" && typeof (window as any).__adobe_cep__ !== "undefined";
}

export function copyToHostClipboard(value: string): boolean {
  if (isCep()) {
    const bridge = (window as any).__adobe_cep__;
    if (typeof bridge.setClipboard === "function") {
      bridge.setClipboard(value);
      return true;
    }
  }

  const scratch = document.createElement("textarea");
  scratch.value = value;
  scratch.setAttribute("readonly", "");
  scratch.style.position = "fixed";
  scratch.style.left = "-10000px";
  document.body.appendChild(scratch);
  scratch.select();
  let copied = false;
  try { copied = document.execCommand("copy"); }
  finally { scratch.remove(); }
  return copied;
}

export function readFromHostClipboard(): string | undefined {
  if (!isCep()) return undefined;
  const bridge = (window as any).__adobe_cep__;
  if (typeof bridge.getClipboard === "function") {
    const value = bridge.getClipboard();
    if (typeof value === "string") return value;
  }

  const scratch = document.createElement("textarea");
  scratch.style.position = "fixed";
  scratch.style.left = "-10000px";
  document.body.appendChild(scratch);
  scratch.focus();
  try {
    if (document.execCommand("paste")) return scratch.value;
  } catch { /* CEP may disallow programmatic paste. */ }
  finally { scratch.remove(); }
  return undefined;
}
