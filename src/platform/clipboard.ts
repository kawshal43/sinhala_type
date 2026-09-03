function isCep(): boolean {
  return typeof window !== "undefined" && typeof (window as any).__adobe_cep__ !== "undefined";
}

function getNodeRequire(): any {
  if (typeof window !== "undefined") {
    if (typeof (window as any).require === "function") return (window as any).require;
    if (typeof (window as any).cep_node?.require === "function") return (window as any).cep_node.require;
    if (typeof (window as any).process?.mainModule?.require === "function") return (window as any).process.mainModule.require;
  }
  return null;
}

export function copyToHostClipboard(value: string): boolean {
  // Strategy 1: Node.js child_process (100% reliable inside Premiere CEP on Windows/macOS)
  const nodeReq = getNodeRequire();
  if (nodeReq) {
    try {
      const childProcess = nodeReq("child_process");
      if (childProcess && typeof childProcess.spawn === "function") {
        const isWin =
          (typeof process !== "undefined" && process.platform === "win32") ||
          (typeof navigator !== "undefined" && navigator.userAgent.includes("Windows"));
        const cmd = isWin ? "clip" : "pbcopy";
        const proc = childProcess.spawn(cmd, [], { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
        if (proc && proc.stdin) {
          proc.stdin.write(value, "utf8");
          proc.stdin.end();
          return true;
        }
      }
    } catch (nodeErr) {
      console.warn("Node clipboard copy error:", nodeErr);
    }
  }

  // Strategy 2: Adobe CEP bridge if available
  if (isCep()) {
    const bridge = (window as any).__adobe_cep__;
    if (bridge && typeof bridge.setClipboard === "function") {
      try {
        bridge.setClipboard(value);
        return true;
      } catch { /* fallback */ }
    }
  }

  // Strategy 3: DOM textarea selection (fallback)
  try {
    const scratch = document.createElement("textarea");
    scratch.value = value;
    scratch.style.position = "fixed";
    scratch.style.left = "0";
    scratch.style.top = "0";
    scratch.style.width = "1px";
    scratch.style.height = "1px";
    scratch.style.opacity = "0";
    scratch.style.pointerEvents = "none";
    document.body.appendChild(scratch);
    scratch.focus();
    scratch.select();
    const copied = document.execCommand("copy");
    scratch.remove();
    if (copied) return true;
  } catch { /* fallback */ }

  return false;
}

export async function copyText(value: string): Promise<boolean> {
  // First try synchronous host clipboard (Node.js/CEP)
  if (copyToHostClipboard(value)) return true;

  // Next try async navigator.clipboard
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (err) {
      console.warn("navigator.clipboard.writeText failed:", err);
    }
  }

  return false;
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
