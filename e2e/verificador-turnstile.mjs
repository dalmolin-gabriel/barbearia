// Verificador local do Turnstile para o e2e sem internet: aprova qualquer token enviado com a
// chave secreta de teste da Cloudflare. Mesmo formato de resposta do siteverify de verdade.
import { createServer } from "node:http";

const SEGREDO_DE_TESTE = "1x0000000000000000000000000000000AA";
const porta = Number(process.env.PORTA ?? 8788);

createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200).end("ok");
    return;
  }
  let corpo = "";
  req.on("data", (p) => (corpo += p));
  req.on("end", () => {
    const f = new URLSearchParams(corpo);
    const ok = f.get("secret") === SEGREDO_DE_TESTE && !!f.get("response");
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ success: ok }));
  });
}).listen(porta, "127.0.0.1");
