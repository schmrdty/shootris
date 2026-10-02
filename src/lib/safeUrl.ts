// Decides whether the server may fetch a URL that came from outside: an NFT's
// tokenURI, say, which whoever deployed the contract chooses.
//
// A server that fetches attacker-chosen URLs can be steered at anything: a
// malware sinkhole (which gets the host's IP blocklisted), a cloud metadata
// address, or another machine on the private network. Only plain public
// HTTPS by hostname gets through.

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isSafePublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;

  const host = url.hostname.toLowerCase();
  // Real metadata hosts have names. A bare IP is how you aim at a sinkhole
  // or a private address, so refuse them outright, v4 and v6 alike.
  if (IPV4.test(host) || host.includes(':') || host.startsWith('[')) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (!host.includes('.')) return false;
  return true;
}
