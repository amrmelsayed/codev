# Specification: Secure Remote Access

## Metadata
- **ID**: 0062
- **Status**: approved
- **Created**: 2025-12-23
- **Protocol**: SPIDER

## Problem Statement

Agent Farm currently binds to localhost only for security. A recent `--allow-insecure-remote` flag (or similar) enables binding to `0.0.0.0`, allowing access from other machines on the network. However, this exposes the dashboard and terminal sessions without authentication.

**Current security model:**
- ttyd binds to localhost (default behavior, no `-i` flag)
- Dashboard server has DNS rebinding protection (rejects non-localhost Host headers)
- CORS restricted to localhost origins
- No authentication layer

**Problem with insecure remote:**
- Anyone on the network can access terminals
- Full shell access to the machine
- Can execute arbitrary commands as the user
- Can read/modify all project files

## Use Cases

1. **iPad/tablet access** - Use Agent Farm from an iPad connected to the same network
2. **Multi-machine workflow** - Architect on laptop, dashboard on desktop monitor
3. **Team collaboration** - Share a dashboard with a colleague for pair programming
4. **Remote development** - Access from coffee shop via VPN/Tailscale

---

## Scope

### In Scope (MVP)

1. **`af tunnel` command** - Outputs SSH command for remote access
2. **Reverse proxy** - Routes `/terminal/:id` to correct ttyd instance
3. **Dashboard UI update** - Change iframes to use proxied URLs
4. **Documentation** - SSH tunnel setup guide

### Out of Scope (Future)

- SSH config generation (`af tunnel --ssh-config`)
- Clipboard copy (`af tunnel --copy`)
- Built-in SSH server (Option B with dropbear)
- `--allow-insecure-remote` flag (deprecated by this feature)

### Non-Goals

- Building a new authentication system
- TLS/certificate management
- Token-based authentication
- OAuth/SSO integration

---

## Solution: SSH Tunnel with Reverse Proxy

### Why SSH?

- **Already authenticated** - keys or password
- **Already encrypted** - no TLS setup needed
- **Already deployed** - every dev machine has sshd (see Platform Notes)
- **Works through NAT/firewalls**
- **No new credentials to manage**

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Remote Device (iPad, laptop)                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  SSH Client                                         │    │
│  │  ssh -L 4200:localhost:4200 user@dev-machine        │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                  │
│                     Port 4200                               │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Browser → http://localhost:4200                    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                      SSH Tunnel
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Dev Machine                                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Dashboard Server (port 4200)                       │    │
│  │                                                     │    │
│  │  GET /              → Dashboard UI                  │    │
│  │  GET /api/*         → REST API                      │    │
│  │  /terminal/:id      → Reverse Proxy → ttyd          │    │
│  └─────────────────────────────────────────────────────┘    │
│            │                    │                    │      │
│            ▼                    ▼                    ▼      │
│     ┌───────────┐        ┌───────────┐        ┌───────────┐ │
│     │ttyd :4201 │        │ttyd :4210 │        │ttyd :4230 │ │
│     │(architect)│        │(builder)  │        │(util)     │ │
│     └───────────┘        └───────────┘        └───────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Component 1: `af tunnel` Command

### Usage

```bash
$ af tunnel
To access Agent Farm remotely, run this on your other device:

  ssh -L 4200:localhost:4200 waleed@192.168.1.50

Then open: http://localhost:4200

Tip: Add to ~/.ssh/config for easy access:
  Host agent-farm
    HostName 192.168.1.50
    User waleed
    LocalForward 4200 localhost:4200
```

### Implementation

```typescript
// packages/codev/src/commands/tunnel.ts

import { networkInterfaces } from 'os';
import { userInfo } from 'os';

export function tunnel() {
  const state = loadState();
  if (!state.running) {
    console.error('Agent Farm is not running. Start with: af start');
    process.exit(1);
  }

  const ips = getLocalIPs();
  const user = userInfo().username;
  const port = state.dashboardPort || 4200;

  console.log('To access Agent Farm remotely, run this on your other device:\n');

  for (const ip of ips) {
    console.log(`  ssh -L ${port}:localhost:${port} ${user}@${ip}`);
  }

  console.log(`\nThen open: http://localhost:${port}`);
  console.log(`\nTip: Add to ~/.ssh/config for easy access:`);
  console.log(`  Host agent-farm`);
  console.log(`    HostName ${ips[0]}`);
  console.log(`    User ${user}`);
  console.log(`    LocalForward ${port} localhost:${port}`);
}

function getLocalIPs(): string[] {
  const interfaces = networkInterfaces();
  const ips: string[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      // Skip loopback, internal, and IPv6
      if (addr.internal) continue;
      if (addr.family !== 'IPv4') continue;
      ips.push(addr.address);
    }
  }

  return ips.length > 0 ? ips : ['<your-ip>'];
}
```

### IP Detection Strategy

**Decision**: Show ALL non-loopback IPv4 addresses.

Rationale:
- Users may have multiple interfaces (WiFi, Ethernet, VPN)
- Showing all lets user pick the right one
- Better than guessing wrong

Example output with multiple interfaces:
```bash
$ af tunnel
To access Agent Farm remotely, run this on your other device:

  ssh -L 4200:localhost:4200 waleed@192.168.1.50    # WiFi
  ssh -L 4200:localhost:4200 waleed@10.0.0.5        # Ethernet

Then open: http://localhost:4200
```

---

## Component 2: Reverse Proxy

### URL Routing

```
/                       → Dashboard UI (static files)
/api/*                  → Dashboard REST API
/terminal/architect     → ttyd on port 4201
/terminal/builder-0055  → ttyd on port 4210
/terminal/util-abc123   → ttyd on port 4230
```

### Implementation (http-proxy-middleware)

**Decision**: Use `http-proxy-middleware` for its Express compatibility and built-in WebSocket support.

```typescript
// packages/codev/src/dashboard/proxy.ts

import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Express } from 'express';

export function setupTerminalProxy(app: Express) {
  app.use('/terminal/:id', (req, res, next) => {
    const terminalId = req.params.id;
    const port = getPortForTerminal(terminalId);

    if (!port) {
      res.status(404).json({ error: `Terminal not found: ${terminalId}` });
      return;
    }

    const proxy = createProxyMiddleware({
      target: `http://localhost:${port}`,
      ws: true,
      pathRewrite: (path) => path.replace(/^\/terminal\/[^/]+/, ''),
      onError: (err, req, res) => {
        console.error(`Proxy error for ${terminalId}:`, err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: `Terminal unavailable: ${terminalId}` });
        }
      },
    });

    proxy(req, res, next);
  });
}

function getPortForTerminal(id: string): number | null {
  const state = loadState();

  if (id === 'architect') {
    return state.architect?.port || null;
  }

  const builder = state.builders?.find(b => `builder-${b.project}` === id);
  if (builder) return builder.port;

  const util = state.utils?.find(u => `util-${u.id}` === id);
  if (util) return util.port;

  return null;
}
```

### WebSocket Upgrade Handling

```typescript
// Handle WebSocket upgrades explicitly
import httpProxy from 'http-proxy';

const wsProxy = httpProxy.createProxyServer({ ws: true });

server.on('upgrade', (req, socket, head) => {
  const match = req.url?.match(/^\/terminal\/([^/]+)/);
  if (match) {
    const port = getPortForTerminal(match[1]);
    if (port) {
      wsProxy.ws(req, socket, head, { target: `http://localhost:${port}` });
    } else {
      socket.destroy();
    }
  }
});

wsProxy.on('error', (err, req, socket) => {
  console.error('WebSocket proxy error:', err.message);
  if (socket && !socket.destroyed) {
    socket.destroy();
  }
});
```

---

## Component 3: Dashboard UI Changes

### Before (Direct ttyd URLs)

```html
<iframe src="http://localhost:4201"></iframe>
<iframe src="http://localhost:4210"></iframe>
```

### After (Proxied URLs)

```html
<iframe src="/terminal/architect"></iframe>
<iframe src="/terminal/builder-0055"></iframe>
```

### Why This Matters

- **Local access**: Browser at `localhost:4200` → iframe loads `/terminal/architect` → resolves to `localhost:4200/terminal/architect`
- **SSH tunnel**: Browser at `localhost:4200` (tunneled) → iframe loads `/terminal/architect` → same URL, tunneled through SSH

The dashboard works identically in both cases.

---

## Backward Compatibility

### Migration Path

1. **Existing sessions continue to work** - ttyd still runs on individual ports
2. **Direct port access still works** - `localhost:4201` accessible locally
3. **Dashboard transparently upgrades** - iframes use proxied URLs
4. **No breaking changes** - old bookmarks to dashboard still work

### Deprecation: `--allow-insecure-remote`

If this flag exists, it should:
1. Print deprecation warning: "Use `af tunnel` for secure remote access"
2. Continue to function for one release cycle
3. Be removed in a future version

---

## Platform Notes

### Windows Support

SSH is available on Windows but requires setup:
- **Windows 10+**: OpenSSH client is built-in; server requires enabling via Settings → Apps → Optional Features
- **WSL2**: Full SSH support via Linux subsystem

The `af tunnel` command should detect Windows and show appropriate guidance:

```bash
# On Windows without SSH server:
$ af tunnel
Note: Windows requires OpenSSH Server to be enabled.
See: https://docs.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse

Alternatively, use WSL2 or Tailscale for remote access.
```

---

## Error Handling

### `af tunnel` Errors

| Condition | Behavior |
|-----------|----------|
| Agent Farm not running | Exit with error: "Agent Farm is not running. Start with: af start" |
| No network interfaces found | Show placeholder: `ssh -L 4200:localhost:4200 user@<your-ip>` |
| Windows without SSH server | Show setup instructions (see Platform Notes) |

### Reverse Proxy Errors

| Condition | HTTP Response |
|-----------|---------------|
| Unknown terminal ID | 404: `{"error": "Terminal not found: xyz"}` |
| ttyd not responding | 502: `{"error": "Terminal unavailable: architect"}` |
| WebSocket upgrade fails | Close socket, log error |

### Dashboard UI Errors

| Condition | Behavior |
|-----------|----------|
| Proxy returns 404 | Show "Terminal not found" in iframe area |
| Proxy returns 502 | Show "Terminal starting..." with retry button |
| WebSocket disconnects | Show reconnection UI (existing ttyd behavior) |

---

## Acceptance Criteria

### `af tunnel` Command

- [ ] Outputs complete SSH command with correct port
- [ ] Detects and displays all non-loopback IPv4 addresses
- [ ] Shows current username in SSH command
- [ ] Works when no builders are active (architect only)
- [ ] Shows helpful error when Agent Farm not running
- [ ] On Windows, shows SSH server setup instructions if needed

### Reverse Proxy

- [ ] Routes `/terminal/architect` to architect ttyd port
- [ ] Routes `/terminal/builder-XXXX` to correct builder ttyd port
- [ ] Routes `/terminal/util-XXXX` to correct utility ttyd port
- [ ] Proxies WebSocket connections bidirectionally
- [ ] Returns 404 for unknown terminal IDs
- [ ] Returns 502 when target ttyd is unavailable
- [ ] Handles concurrent connections to multiple terminals

### Dashboard UI

- [ ] All terminal iframes use `/terminal/:id` URLs
- [ ] Terminals work identically via local access and SSH tunnel
- [ ] WebSocket reconnection works through proxy
- [ ] Error states displayed appropriately

### Security

- [ ] Dashboard still rejects non-localhost Host headers
- [ ] Proxy only routes to local ttyd instances (no SSRF)
- [ ] No new network listeners (only existing port 4200)
- [ ] No credentials stored or transmitted

---

## Test Scenarios

### Unit Tests

1. **IP detection**
   - Mock `networkInterfaces()` with multiple interfaces
   - Verify all non-loopback IPv4 addresses returned
   - Verify loopback (127.0.0.1) excluded
   - Verify IPv6 excluded

2. **Port lookup**
   - Verify `architect` maps to architect port
   - Verify `builder-0055` maps to correct builder port
   - Verify unknown ID returns null

### Integration Tests

3. **`af tunnel` command**
   - Start Agent Farm, run `af tunnel`, verify output format
   - Verify SSH command includes correct port and IP
   - Verify error when Agent Farm not running

4. **Reverse proxy routing**
   - Start Agent Farm with architect + 2 builders
   - HTTP GET `/terminal/architect` → 200 (ttyd HTML)
   - HTTP GET `/terminal/builder-0055` → 200
   - HTTP GET `/terminal/unknown` → 404

5. **WebSocket proxying**
   - Connect WebSocket to `/terminal/architect`
   - Send terminal input, verify response
   - Disconnect, verify clean shutdown

### Manual Tests

6. **End-to-end SSH tunnel**
   - Start Agent Farm on machine A
   - Run `af tunnel`, copy SSH command
   - On machine B, run SSH command
   - Open `http://localhost:4200` on machine B
   - Interact with terminals, verify functionality

7. **Concurrent sessions**
   - Two browsers connected via SSH tunnel
   - Both interact with same terminal
   - Verify no conflicts or corruption

---

## Security Considerations

1. **SSH is the security layer** - All auth/encryption delegated to SSH
2. **No new attack surface** - Dashboard stays localhost-only, accessed via tunnel
3. **Key management** - Users responsible for SSH key security (existing practice)
4. **Reverse proxy** - Only proxies to local ttyd instances, no external connections
5. **Host header validation** - Keep existing DNS rebinding protection

---

## Dependencies

- **New npm packages**: `http-proxy-middleware` (or `http-proxy`)
- **No external services required**
- **No new system dependencies**

---

## References

- [SSH Port Forwarding Guide](https://www.ssh.com/academy/ssh/tunneling/example)
- [http-proxy-middleware docs](https://github.com/chimurai/http-proxy-middleware)
- [ttyd WebSocket protocol](https://github.com/tsl0922/ttyd#protocol)
