# Aggiornamento V13 – comuni ufficiali, ricerca a suggerimenti, indicizzazione

## Come applicarlo (nella tua cartella di lavoro)
1. Fai una COPIA di sicurezza di `catalogo/meridiane.ods`.
2. Copia i file di questo pacchetto nella tua cartella, mantenendo le sottocartelle
   (sovrascrivi quando richiesto). Le tue foto non vengono toccate.
3. Fai doppio clic su `aggiorna_catalogo.bat`: rigenera `data.json`, `comuni.json` e le miniature.
4. Carica su GitHub: `index.html`, `style.css`, `app.js`, `data.json`, `comuni.json`,
   `sitemap.xml`, `robots.txt` e le cartelle `catalogo/foto`, `catalogo/thumbs`, `catalogo/medie`.
   NON serve caricare `catalogo/comuni_italiani.csv` né il file .ods (servono solo sul tuo PC).

## Come si inserisce una nuova meridiana
Nel foglio "Meridiane" la colonna `comune` ha un menu a tendina: scegli il comune dall'elenco
(formato `Nome (Provincia)`, es. `Lonato del Garda (BS)`). Se scrivi un nome non valido,
Calc lo rifiuta; se comunque ne arrivasse uno sbagliato, `aggiorna_catalogo.bat` si ferma
e indica la riga e il nome più simile, senza toccare il sito.
Il foglio "Comuni" contiene l'elenco (7.904 comuni): non va modificato.
