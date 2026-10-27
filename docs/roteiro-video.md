# Roteiro do vídeo de demo (75 a 90 s)

Gravação de tela no celular (ou no Chrome em modo celular, 390 x 844) com narração em inglês, voz calma. Sem música alta; se tiver, um violão baixo.

## Antes de gravar

1. Abrir uma vez `https://geoletter.157-151-149-35.sslip.io/?demo=1&token=<ADMIN_TOKEN>` no navegador da gravação. O token está em `.env` (`ADMIN_TOKEN`). O cookie dura 24 h.
2. Deixar a localização do navegador permitida (para aparecer a distância real da carta trancada).
3. Abrir antes, uma vez, a carta de São Paulo e clicar em "Read it in English", para a tradução já estar em cache (ou mostrar a espera de verdade, se quiser, cortando no meio).
4. Ter pronto o texto da carta ruim (cena 4) para colar.
5. Deixar o journal aberto num terminal: `sudo journalctl -u geoletter -f` (cena 6).

## Cenas

| Tempo | Tela | Narração (EN) |
|---|---|---|
| 0:00–0:08 | Mapa-múndi em tom de papel, pontos de luz. | "On the Day of the Dead we set a place for the people we lost. GeoLetter lets you leave that place where it actually was." |
| 0:08–0:20 | Tocar em "A letter for Abuela Chayo" na lista. O mapa voa até Oaxaca, painel abre, toca em "Read the letter". Página da carta em papel. | "A marigold, a candle, or a letter, left at a plaza in Oaxaca, a bakery in São Paulo, a beach in Lagos." |
| 0:20–0:28 | Botão "Read it in English" no rodapé. O texto troca com um fade. | "Letters keep their language. Gemma, running on this server, translates them for whoever reads." |
| 0:28–0:45 | Voltar ao mapa, tocar num lugar vazio. Escolher "A letter". Abrir "Help me find the words", colar notas soltas, "Write a draft from this". Cortar a espera. Rascunho aparece; editar uma palavra; "Leave the letter". Vela + "Waiting for the guardian". | "If you don't know how to start, write what you remember. Gemma drafts a letter from your words only, and you change it. Then the guardian reads it before anyone else." |
| 0:45–0:55 | Corte para quando aparece "The guardian let it through. It is on the map now." | "This one stays." |
| 0:55–1:05 | Nova carta com nome, endereço e telefone de alguém (texto abaixo). Enviar. Corte para "The guardian kept it back" + motivo em português. | "This one doesn't. Phone numbers, home addresses, hate, threats: turned away, and only the author sees why." |
| 1:05–1:18 | Abrir a carta de Lagos. Vela apagada. "I am here. Open it" mostra "You are about 6,000 km away". Tocar em "Demo: open as if I were there". A carta abre com fade. | "Some letters are sealed to the place. They only open within two hundred metres. For this video I'm cheating." |
| 1:18–1:28 | Terminal com o `[mail:log]` de "Someone left a letter for you in…" (opcional) e volta ao mapa. | "If the letter is for someone alive, they get one short note with a link. Never the letter. No outside AI service ever reads any of this." |
| 1:28–1:30 | Mapa parado. Texto pequeno: "GeoLetter · Gemma 4 on Ollama · open source". | (silêncio) |

## Texto da carta que deve ser barrada (cena 5)

```
Juliana, everyone should know what you did. You live at 142 Acacia Street, apartment 31. Call her at (11) 98765-4321 and tell her.
```

## Notas

- A moderação leva de 12 a 25 s na CPU; corte a espera, mas deixe 1 ou 2 s da vela e da fila aparecendo, porque mostram que é local e real.
- Não mostrar o token de demo nem o `.env` na tela.
- Depois de gravar, apagar as cartas de teste (são as que não são `is_example`).
