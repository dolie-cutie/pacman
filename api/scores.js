import { put, list } from "@vercel/blob";

const BLOB_KEY = "leaderboard.json";
const MAX_KEEP = 100; // entries persisted
const TOP = 10;       // entries served

async function readBoard() {
  const { blobs } = await list({ prefix: BLOB_KEY });
  const blob = blobs.find((b) => b.pathname === BLOB_KEY);
  if (!blob) return [];
  // query param busts the blob CDN cache so reads see recent writes
  const res = await fetch(`${blob.url}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return [];
  try {
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const board = await readBoard();
      return res.status(200).json(board.slice(0, TOP));
    }

    if (req.method === "POST") {
      const { name, score } = req.body || {};
      const cleanName =
        String(name || "")
          .replace(/[^\w !?.@$&*()'-]/g, "")
          .trim()
          .slice(0, 12) || "ANON";
      const cleanScore = Math.floor(Number(score));
      if (!Number.isFinite(cleanScore) || cleanScore <= 0 || cleanScore > 1000000) {
        return res.status(400).json({ error: "invalid score" });
      }

      const board = await readBoard();
      board.push({ name: cleanName, score: cleanScore, ts: Date.now() });
      board.sort((a, b) => b.score - a.score || a.ts - b.ts);
      const trimmed = board.slice(0, MAX_KEEP);

      await put(BLOB_KEY, JSON.stringify(trimmed), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });

      return res.status(200).json(trimmed.slice(0, TOP));
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    console.error("scores api error:", err);
    return res.status(500).json({ error: "server error" });
  }
}
