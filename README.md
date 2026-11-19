# Apuração ao vivo · DF 2026

Painel público que acompanhou a apuração das eleições de 2026 no Distrito Federal **direto dos arquivos do TSE**, a cada 30 segundos, e mostrou como o voto vira cadeira.

**No ar:** https://apuracao.scalewebmedia.com/

## O que o painel faz

- Lê os arquivos públicos de resultados do TSE (`resultados.tse.jus.br`) no navegador, sem servidor intermediário.
- Mostra seções apuradas, comparecimento, abstenção, brancos e nulos.
- Majoritários (governador, senado, presidente no DF), com o selo de 1º/2º turno e o resultado final do 2º turno.
- **Proporcional "se terminasse agora"**: calcula quociente eleitoral, quociente partidário e sobras (regra 80/20 e 3ª fase) para deputado distrital (24 cadeiras) e federal (8), com hemiciclo, lista de eleitos, a fronteira (último a entrar, primeiro de fora) e as mudanças ao longo da noite.
- Animação didática "Como o voto vira cadeira", passo a passo.
- Busca de candidato por nome de urna ou número.

## Como foi feito

| Peça | Arquivo |
|---|---|
| Motor das cadeiras (sem dependências; roda no navegador e no Node) | `motor.js` |
| Leitura do TSE, ciclo de 30 s, espelho de contingência, desenho da página | `app.js` |
| Animação do quociente | `animacao.js` |
| Gráficos da noite e popups explicativos (SVG à mão) | `mod_graficos/` |
| Disputa interna por agremiação | `mod_partidos/` |
| Resultado final do 2º turno (arquivo oficial do TSE, conferido por hash) | `dados/segundo_turno.json` |
| Política de segurança (CSP) liberando só o TSE e as fontes | `.htaccess` |

Princípios: JavaScript puro, nenhum número digitado à mão, nenhuma estimativa — o que o TSE ainda não publicou aparece como "—". Se um arquivo do TSE falha três vezes, a página lê um espelho e avisa "fonte: espelho".

O motor foi validado contra os eleitos marcados pelo TSE nos arquivos finais de vereador de 2024.

## Rodar localmente

Qualquer servidor estático serve:

```bash
python -m http.server 8000
# abra http://localhost:8000
```

`?motor=stub` força o motor de desenvolvimento.

---
Desenvolvido por Evandro de Melo para a [Scale Web Media](https://scalewebmedia.com) · *Cognoscere, non opinari*.
Código publicado para consulta; todos os direitos reservados.
