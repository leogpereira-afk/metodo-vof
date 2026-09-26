#!/bin/bash
# ============================================================================
# Publica a Edge Function vof-sync no Supabase (projeto compartilhado).
#
# POR QUE ESTE ARQUIVO EXISTE: a integração GitHub e Supabase NÃO republica as
# functions no push. Sem isto, o conserto fica no git e o servidor continua
# servindo o buraco, calado.
#
# DOIS ARQUIVOS: o index.ts importa ./regras.mjs (as regras que os testes rodam
# no Node). Subir só o index.ts publica uma função que não abre. Este script
# anexa TODO arquivo irmão que o index.ts importa com `from "./x.mjs"` ou `from "./x.js"`.
#
# ARMADILHA: a Management API recusa o User-Agent padrão do urllib (Cloudflare
# 1010, HTTP 403). Por isso aqui é curl.
#
# DEPOIS DE PUBLICAR, CONFIRA NO AR, não a resposta do deploy: sem credencial
# a porta tem de responder 401, e com crachá de outro sistema também 401.
#
# COMO USAR (o token é o "personal access token" do Supabase, começa com sbp_):
#   export SUPABASE_ACCESS_TOKEN=sbp_...
#   ./supabase/publicar-functions.sh
#
# O token NÃO fica gravado em lugar nenhum. Nunca escreva ele num arquivo do
# repositório: este repo é público.
#
# Secrets que a função lê (configurar no painel do Supabase, nunca no código):
#   EQUIPE_JWT_SECRET  o mesmo das outras portas da casa (assina o crachá)
#   VOF_TOKEN          só da máquina de backup; 32 caracteres ou mais
#                      (gere com: openssl rand -hex 32)
# ============================================================================
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-heveemylixartyijxewh}"
TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
RAIZ="$(cd "$(dirname "$0")/functions" && pwd)"

if [ -z "$TOKEN" ]; then
  echo "Falta o token. Rode:  export SUPABASE_ACCESS_TOKEN=sbp_..." >&2
  exit 1
fi

FUNCOES=("$@")
if [ ${#FUNCOES[@]} -eq 0 ]; then
  FUNCOES=(vof-sync)
fi

cd "$RAIZ"
falhou=0
for fn in "${FUNCOES[@]}"; do
  [ -f "$fn/index.ts" ] || { echo "$fn: não existe em supabase/functions"; falhou=1; continue; }

  args=(-F "file=@$fn/index.ts;filename=index.ts;type=application/typescript")
  # Casa o ALVO do import (from "./x.mjs"), não a palavra solta num comentário.
  while read -r dep; do
    [ -z "$dep" ] && continue
    if [ -f "$fn/$dep" ]; then
      args+=(-F "file=@$fn/$dep;filename=$dep;type=application/javascript")
    else
      echo "$fn: o index.ts importa ./$dep, que não existe"; falhou=1; continue 2
    fi
  done < <(grep -oE 'from "\./[A-Za-z0-9_.-]+\.m?js"' "$fn/index.ts" | sed -E 's|from "\./||; s|"$||' | sort -u)

  # verify_jwt=false de propósito: quem confere o crachá é a própria função.
  resp=$(curl -sS -X POST \
    "https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=$fn" \
    -H "Authorization: Bearer $TOKEN" \
    -F "metadata={\"entrypoint_path\":\"index.ts\",\"name\":\"$fn\",\"verify_jwt\":false};type=application/json" \
    "${args[@]}") || { echo "$fn: falhou a chamada"; falhou=1; continue; }

  echo "$resp" | FN="$fn" python3 -c "
import json, os, sys
fn = os.environ['FN']
try:
    d = json.load(sys.stdin)
except Exception:
    print(f'{fn}: resposta inesperada'); sys.exit(1)
if d.get('version'):
    print(f\"{fn}: {d.get('status')} v{d.get('version')}\")
else:
    print(f\"{fn}: ERRO: {d.get('message') or d}\"); sys.exit(1)
" || falhou=1
done

exit $falhou
