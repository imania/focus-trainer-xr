# Cloudflare Tunnel for Quest testing

Quest Browser cannot access your PC's `localhost`. Use a Cloudflare HTTPS URL instead.

## Quick tunnel

Use this for temporary Quest testing.

```powershell
.\scripts\start-cloudflare-quick.ps1
```

The script starts the local app server and then runs:

```powershell
cloudflared tunnel --url http://localhost:8080
```

When Cloudflare prints a `https://*.trycloudflare.com` URL, open that URL in Quest Browser and press `Enter VR`.

## Account tunnel

Use this if you created a tunnel in the Cloudflare dashboard.

1. Open Cloudflare Zero Trust.
2. Go to Networks > Tunnels.
3. Create a Cloudflared tunnel.
4. Add a Public Hostname that points to `http://localhost:8080`.
5. Copy the connector token.
6. Save the token to `cloudflare-token.txt` or pass it as `-Token`.

```powershell
.\scripts\start-cloudflare-token-tunnel.ps1
```

`cloudflare-token.txt` is ignored by git.

## Notes

- Quick Tunnel URLs are temporary and change every run.
- For production or repeated Quest testing, use an account tunnel with your own hostname.
- Keep the local server and `cloudflared` running while using Quest.
