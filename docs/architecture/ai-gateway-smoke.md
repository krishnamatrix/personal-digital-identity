# AI gateway curl checks

Run from the project root. The smoke script invokes curl and reads **only** supported key settings: the
`llm_api_key` assignment (or `LLM_API_KEY` / legacy `AI_API_KEY`) from the explicitly supplied env file (or uses an existing
process variable). It never sources the file as shell code, prints credentials,
or sends a real resume. It passes bearer auth to curl through stdin configuration,
not command-line arguments. Synthetic inference can consume gateway/provider quota.

```sh
python3 scripts/ai/smoke-gateway.py --env-file .env.local
```

The runner accepts `llm_api_key`, `LLM_API_KEY`, or legacy `AI_API_KEY`; process credentials take precedence over the explicitly named file. Standalone examples below still use the legacy shell variable.

The default checks authenticated model discovery, plain Chat Completions with
`model=auto`, and strict JSON Schema output. Each request has a two-minute timeout.
To also test Responses, Anthropic-compatible Messages and Embeddings:

```sh
python3 scripts/ai/smoke-gateway.py --env-file .env.local --all
```

Exit code 0 means all requested checks passed. Summaries show HTTP status and
response validation without dumping model lists, generated embeddings or raw
provider errors. An HTTP 401 stops further tests. These checks do not prove PDF
support, full resume extraction, database persistence, or provider retention.

## Standalone curl examples

These examples expect `AI_API_KEY` already set in your shell environment. Setting
it in `.env.local` does not export it to your terminal; use the Python runner above
to load the one designated variable without sourcing or displaying the env file.
Never substitute a real key into this document or check it into Git.

List models:

```sh
curl --silent --show-error --max-time 30 \
  'http://127.0.0.1:31415/v1/models' \
  --header "Authorization: Bearer ${AI_API_KEY:?Set AI_API_KEY first}"
```

Chat with the configured automatic route:

```sh
curl --silent --show-error --max-time 120 \
  'http://127.0.0.1:31415/v1/chat/completions' \
  --header "Authorization: Bearer ${AI_API_KEY:?Set AI_API_KEY first}" \
  --header 'Content-Type: application/json' \
  --data '{"model":"auto","messages":[{"role":"user","content":"Reply with exactly OK, no punctuation."}],"max_tokens":128,"stream":false}'
```

Check the structured format used by the application:

```sh
curl --silent --show-error --max-time 120 \
  'http://127.0.0.1:31415/v1/chat/completions' \
  --header "Authorization: Bearer ${AI_API_KEY:?Set AI_API_KEY first}" \
  --header 'Content-Type: application/json' \
  --data '{"model":"auto","messages":[{"role":"user","content":"Return JSON exactly {\"ok\":true}."}],"response_format":{"type":"json_schema","json_schema":{"name":"gateway_smoke","strict":true,"schema":{"type":"object","properties":{"ok":{"type":"boolean","const":true}},"required":["ok"],"additionalProperties":false}}},"max_tokens":128,"stream":false}'
```

The Python runner is preferable for routine checks because it keeps the key out
of curl's command-line arguments and validates the response shape automatically.

## Verified result — 2026-11-15

| Check                             | HTTP | Validation                                                |
| --------------------------------- | ---- | --------------------------------------------------------- |
| Models                            | 200  | 409 model entries                                         |
| Chat Completions, auto            | 200  | Exact synthetic OK reply, stop finish                     |
| Structured Chat Completions, auto | 200  | Exact JSON object matched strict test schema, stop finish |
| Responses, auto                   | 200  | Exact synthetic OK reply                                  |
| Messages, auto                    | 200  | Exact synthetic OK reply                                  |
| Embeddings, auto                  | 200  | Numeric vector with 3,072 dimensions                      |

All six checks passed using the key from the user-designated env file. `auto`
routed the two chat requests to different underlying models; a schema smoke pass
does not guarantee every auto-selected model supports PDF or the full resume schema.
No private document was sent. Restart `pnpm dev` after adding/changing the key.
