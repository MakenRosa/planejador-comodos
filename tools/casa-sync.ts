/**
 * "A casa em arquivos": o servidor do Vite (npm run dev / npm run preview) guarda o projeto aberto
 * no navegador em arquivos da pasta casa/, para versionar com git e continuar em outro PC.
 *
 *   casa/projeto.json      cômodos, paredes, portas, móveis, acabamentos e medições
 *   casa/checkpoints.json  versões salvas para comparar (com as miniaturas)
 *   casa/modelos/<id>.glb  modelos 3D importados
 *   casa/scans/casa.json   definição da casa + um .json por scan do RoomPlan (só leitura)
 *
 * A pasta fica fora do repositório do app (está no .gitignore): pode ser um repositório git próprio,
 * privado. CASA_DIR troca o caminho (relativo à raiz do projeto ou absoluto).
 *
 * O app lê esses arquivos ao abrir (eles mandam sobre o que estiver no navegador) e grava a cada
 * alteração. Se um arquivo muda por fora (git pull, checkout), o app recarrega a casa sozinho.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin, ViteDevServer } from 'vite'

const FILES = { projeto: 'projeto.json', checkpoints: 'checkpoints.json' } as const
type Doc = keyof typeof FILES

/** JSON indentado, mas com listas curtas (coordenadas, cores) numa linha só — diffs legíveis no git. */
function pretty(data: unknown): string {
  const txt = JSON.stringify(data, null, 2)
  // junta só as quebras de linha entre os itens (string JSON não tem quebra de linha crua: é seguro)
  return txt.replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_m, inner: string) => `[${inner.replace(/\s*\n\s*/g, ' ')}]`) + '\n'
}

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function casaSync(root = process.cwd()): Plugin {
  const dir = path.resolve(root, process.env.CASA_DIR || 'casa')
  const modelDir = path.join(dir, 'modelos')
  const scanDir = path.join(dir, 'scans')
  // o que o próprio servidor acabou de gravar (para não avisar o app da própria gravação)
  const written = new Map<string, string>()

  const write = (file: string, content: string | Buffer) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const key = typeof content === 'string' ? content : content.toString('base64')
    if (fs.existsSync(file)) {
      const cur = fs.readFileSync(file)
      if ((typeof content === 'string' ? cur.toString('utf8') : cur.toString('base64')) === key) return
    }
    written.set(path.resolve(file), key)
    fs.writeFileSync(file, content)
  }

  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url ?? '', 'http://x')
    if (!url.pathname.startsWith('/__casa/')) return next()
    const send = (code: number, body: string | Buffer = '', type = 'application/json') => {
      res.statusCode = code
      res.setHeader('Content-Type', type)
      res.setHeader('Cache-Control', 'no-store')
      res.end(body)
    }
    try {
      const [, , what, id] = url.pathname.split('/')
      if (what === 'status') return send(200, JSON.stringify({ ok: true, dir: path.relative(root, dir).replace(/\\/g, '/') || '.' }))
      if (what === 'scans' && id && /^[\w.-]+\.json$/.test(id) && req.method === 'GET') {
        const file = path.join(scanDir, id)
        return fs.existsSync(file) ? send(200, fs.readFileSync(file, 'utf8')) : send(404)
      }
      if (what === 'projeto' || what === 'checkpoints') {
        const file = path.join(dir, FILES[what as Doc])
        if (req.method === 'GET') return fs.existsSync(file) ? send(200, fs.readFileSync(file, 'utf8')) : send(404)
        if (req.method === 'PUT') {
          const data = JSON.parse((await readBody(req)).toString('utf8'))
          write(file, pretty(data))
          return send(204)
        }
      }
      if (what === 'modelos' && id && /^[\w-]+$/.test(id)) {
        const file = path.join(modelDir, `${id}.glb`)
        if (req.method === 'GET') return fs.existsSync(file) ? send(200, fs.readFileSync(file), 'model/gltf-binary') : send(404)
        if (req.method === 'PUT') {
          write(file, await readBody(req))
          return send(204)
        }
        if (req.method === 'DELETE') {
          if (fs.existsSync(file)) fs.rmSync(file)
          return send(204)
        }
      }
      send(405)
    } catch (err) {
      send(500, JSON.stringify({ error: String(err) }))
    }
  }

  return {
    name: 'casa-sync',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(middleware)
      // arquivo alterado por fora (git pull, checkout, edição à mão): avisa o app para recarregar
      server.watcher.add(dir)
      const onChange = (file: string) => {
        const abs = path.resolve(file)
        if (!abs.startsWith(path.resolve(dir) + path.sep)) return
        let key: string | null = null
        try {
          const buf = fs.readFileSync(abs)
          key = abs.endsWith('.glb') ? buf.toString('base64') : buf.toString('utf8')
        } catch {
          /* apagado */
        }
        if (key !== null && written.get(abs) === key) return
        written.delete(abs)
        server.ws.send({ type: 'custom', event: 'casa:changed', data: { file: path.relative(dir, abs).replace(/\\/g, '/') } })
      }
      server.watcher.on('change', onChange)
      server.watcher.on('add', onChange)
      server.watcher.on('unlink', onChange)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
