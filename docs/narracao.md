# Narração do vídeo de demo

Texto em inglês para a voz (ElevenLabs), casado com `docs/demo.mp4` e `docs/demo-vertical.mp4`. As duas versões têm a mesma linha do tempo: 88,3 s.

Tom: calmo, baixo, sem pressa, como quem conta uma coisa de família. Pausas curtas entre as frases. Os tempos marcam onde cada fala começa e até onde ela pode ir. Se a voz sair mais longa, corte palavras em vez de acelerar.

| # | Início | Fim (máx.) | Na tela | Narração (EN) |
|---|---|---|---|---|
| 1 | 0:00.5 | 0:10.5 | Mapa-múndi em tom de papel; o mapa aproxima até Oaxaca. | On the Day of the Dead, we set a place for the people we've lost. GeoLetter lets you set it where it really was. |
| 2 | 0:11.3 | 0:15.8 | Painel do Panteón General, Oaxaca, com a carta para Abuela Chayo. | A cemetery in Oaxaca. Someone left a letter here for her grandmother. |
| 3 | 0:16.5 | 0:21.5 | A carta aberta, em papel, em espanhol. | It reads like paper, in the language it was written in. |
| 4 | 0:22.5 | 0:26.5 | "Leave the marigold"; a vela de espera aparece. | You can leave a marigold. That's enough. |
| 5 | 0:27.3 | 0:37.5 | Busca "Mercado de San Telmo"; carta curta em espanhol para Tío Ernesto (exemplo). | Or find a place of your own, and write. This one is an example: a niece, an uncle, a record stall in Buenos Aires. |
| 6 | 0:38.3 | 0:44.8 | "Waiting for the guardian. 1 offering is ahead of yours." / "The guardian is reading it now." (acelerado) | The guardian reads it first. It's Gemma, an open model, running on our own small server. |
| 7 | 0:45.3 | 0:47.8 | "The guardian let it through. It is on the map now." | This one stays. |
| 8 | 0:48.6 | 0:59.0 | Página da carta nova; "Read it in English"; a tradução entra. | Letters keep their language. A reader can ask for theirs, and Gemma translates it right there. Nothing goes out to anyone else. |
| 9 | 0:59.7 | 1:10.3 | Bar Beach, Lagos: vela apagada; "You are about 6,372 km away." | Some letters are sealed to the place. This one, on a beach in Lagos, opens within two hundred metres. From São Paulo, it stays shut. |
| 10 | 1:10.8 | 1:14.3 | Modo demo: a carta abre. | For this video, we cheat a little. |
| 11 | 1:14.9 | 1:22.5 | "Help me find the words": notas soltas viram um rascunho (acelerado). | And if you don't know how to start, write what you remember. Gemma drafts it from your words, and only yours. |
| 12 | 1:23.3 | 1:27.5 | Volta ao mapa-múndi. Legenda final. | GeoLetter. For the people we carry. |

Depois da fala 12, silêncio até o fim (fade de 0,9 s).

## Texto corrido (para colar na ElevenLabs)

```
On the Day of the Dead, we set a place for the people we've lost. GeoLetter lets you set it where it really was.

A cemetery in Oaxaca. Someone left a letter here for her grandmother.

It reads like paper, in the language it was written in.

You can leave a marigold. That's enough.

Or find a place of your own, and write. This one is an example: a niece, an uncle, a record stall in Buenos Aires.

The guardian reads it first. It's Gemma, an open model, running on our own small server.

This one stays.

Letters keep their language. A reader can ask for theirs, and Gemma translates it right there. Nothing goes out to anyone else.

Some letters are sealed to the place. This one, on a beach in Lagos, opens within two hundred metres. From São Paulo, it stays shut.

For this video, we cheat a little.

And if you don't know how to start, write what you remember. Gemma drafts it from your words, and only yours.

GeoLetter. For the people we carry.
```

## Notas

- A voz é sintética e não finge ser o autor: o vídeo narrado termina com a legenda pequena "Narration: ElevenLabs".
- Versão narrada (`docs/demo-narrated.mp4`, `docs/demo-vertical-narrated.mp4`): voz "George" da biblioteca padrão da ElevenLabs, `eleven_multilingual_v2`, stability 0.8, style 0, speed 0.95, uma requisição por fala (930 caracteres). Áudio em -16 LUFS. Para gerar de novo: `scripts/narrate.py tts` e depois `scripts/narrate.py mix`. O script lê o texto desta tabela.
- As cartas de Oaxaca e de Lagos são exemplos do seed. A carta de San Telmo e o cempasúchil de Oaxaca foram deixados durante a gravação e ficaram marcados como exemplo (`is_example = 1`, o mesmo mecanismo do seed). As pessoas são inventadas.
- As esperas do Gemma estão aceleradas e a legenda diz "sped up": a moderação levou cerca de 30 s, a tradução 25 s e o rascunho 30 s, em CPU.
- Para refazer: `node scripts/record-demo.mjs desktop <pasta>`, depois `python3 scripts/build-video.py desktop <pasta> docs/demo.mp4` (o roteiro de cortes fica no início desse script).
