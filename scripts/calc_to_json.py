"""Converte catalogo/meridiane.ods in data.json + comuni.json.

- Controlla che ogni comune sia nell'elenco ufficiale (catalogo/comuni_italiani.csv)
  nel formato "Nome (Provincia)", es. "Lonato del Garda (BS)".
- Scrive in comuni.json le coordinate dei SOLI comuni che hanno meridiane.
- Crea le miniature delle foto (scripts/genera_miniature.py).
"""
import csv
import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path

from odf.opendocument import load
from odf.table import Table, TableRow, TableCell
from odf import teletype

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "catalogo" / "meridiane.ods"
ANAGRAFICA = ROOT / "catalogo" / "comuni_italiani.csv"
OUT = ROOT / "data.json"
OUT_COMUNI = ROOT / "comuni.json"


def norm(s):
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).strip().lower()


def fail(lines):
    print()
    print("========================================")
    print("  ERRORE - catalogo NON aggiornato")
    print("========================================")
    for l in lines:
        print(l)
    sys.exit(1)


def clean(v):
    return "" if v in ("None", "null") else v


# ---------- elenco ufficiale dei comuni ----------
if not ANAGRAFICA.exists():
    fail([f"Non trovo {ANAGRAFICA}"])
if not SOURCE.exists():
    fail(["Non trovo il file catalogo/meridiane.ods"])

anagrafica = {}                 # "Lonato del Garda (BS)" -> dati
per_nome = {}                   # nome normalizzato -> [etichette]
with open(ANAGRAFICA, encoding="utf-8-sig", newline="") as f:
    for r in csv.DictReader(f):
        label = f"{r['comune']} ({r['sigla']})"
        anagrafica[label] = r
        per_nome.setdefault(norm(r["comune"]), []).append(label)
per_label_norm = {norm(l): l for l in anagrafica}


def risolvi_comune(testo):
    """Ritorna (etichetta ufficiale, avviso) oppure (None, messaggio d'errore)."""
    if testo in anagrafica:
        return testo, None
    n = norm(testo)
    if n in per_label_norm:                       # solo maiuscole/accenti diversi
        return per_label_norm[n], f'"{testo}" -> "{per_label_norm[n]}"'
    if n in per_nome:                             # scritto senza provincia
        cand = per_nome[n]
        if len(cand) == 1:
            return cand[0], f'"{testo}" -> "{cand[0]}" (provincia aggiunta)'
        return None, f'"{testo}" esiste in più province: scegli tra ' + ", ".join(cand)
    # somiglianza con l'inizio di ogni nome (così "Lonatto" trova "Lonato del Garda")
    punteggi = []
    for nn in per_nome:
        r = max(difflib.SequenceMatcher(None, n, nn).ratio(),
                difflib.SequenceMatcher(None, n, nn[:len(n)]).ratio() - 0.05)
        if r >= 0.75:
            punteggi.append((r, nn))
    punteggi.sort(reverse=True)
    vicini = [lab for _, nn in punteggi[:3] for lab in per_nome[nn]][:4]
    msg = f'"{testo}" non è nell\'elenco dei comuni.'
    if vicini:
        msg += " Forse intendevi: " + ", ".join(vicini)
    return None, msg


# ---------- lettura del foglio ----------
doc = load(str(SOURCE))
tables = doc.spreadsheet.getElementsByType(Table)
if not tables:
    fail(["Il file ODS non contiene fogli di calcolo."])
table = next((t for t in tables if t.getAttribute("name") == "Meridiane"), tables[0])
rows = table.getElementsByType(TableRow)
if not rows:
    fail(["Il foglio Calc è vuoto."])

headers = [teletype.extractText(c).strip() for c in rows[0].getElementsByType(TableCell)]
required = ["id", "comune", "località", "foto", "motto", "anno fotografia", "google maps", "note"]
missing = [h for h in required if h not in headers]
if missing:
    fail(["Nel foglio mancano queste colonne: " + ", ".join(missing)])
indexes = {name: headers.index(name) for name in required}

records, errori, avvisi, usati = [], [], [], {}
for n_riga, row in enumerate(rows[1:], start=2):
    values = [teletype.extractText(c).strip() for c in row.getElementsByType(TableCell)]
    if len(values) < len(headers):
        values.extend([""] * (len(headers) - len(values)))
    if not any(values):
        continue

    def value(col):
        i = indexes[col]
        return values[i].strip() if i < len(values) else ""

    comune_scritto = value("comune")
    if not comune_scritto:
        continue

    label, msg = risolvi_comune(comune_scritto)
    if label is None:
        errori.append(f"  riga {n_riga}: {msg}")
        continue
    if msg:
        avvisi.append(f"  riga {n_riga}: {msg}")
    info = anagrafica[label]
    usati[label] = info

    raw_id = value("id")
    try:
        ident = int(raw_id)
    except ValueError:
        ident = raw_id

    foto_value = clean(value("foto"))
    if foto_value:
        p = ROOT / foto_value
        if not p.exists():
            for ext in (".jpg", ".jpeg", ".png", ".webp"):
                if p.with_suffix(ext).exists():
                    foto_value = p.with_suffix(ext).relative_to(ROOT).as_posix()
                    break
            else:
                avvisi.append(f"  riga {n_riga}: foto non trovata: {foto_value}")

    records.append({
        "id": ident,
        "comune": label,
        "nome": info["comune"],
        "provincia": info["sigla"],
        "localita": clean(value("località")),
        "foto": foto_value,
        "motto": clean(value("motto")),
        "anno fotografia": clean(value("anno fotografia")),
        "google maps": clean(value("google maps")),
        "note": clean(value("note")),
    })

if errori:
    fail(["Comuni non validi (scegli il comune dal menu a tendina del foglio):"] + errori)

# ---------- scrittura ----------
OUT.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

comuni_json = {}
for label in sorted(usati, key=norm):
    i = usati[label]
    voce = {"nome": i["comune"], "sigla": i["sigla"], "provincia": i["provincia"], "regione": i["regione"]}
    if i["lat"] and i["lon"]:
        voce["lat"], voce["lon"] = float(i["lat"]), float(i["lon"])
    else:
        avvisi.append(f"  {label}: coordinate mancanti, il comune non comparirà sulla mappa")
    comuni_json[label] = voce
OUT_COMUNI.write_text(json.dumps(comuni_json, ensure_ascii=False, indent=2), encoding="utf-8")

print()
print("========================================")
print("  AGGIORNAMENTO CATALOGO COMPLETATO")
print("========================================")
print()
print(f"Meridiane elaborate: {len(records)}")
print(f"Comuni con meridiane: {len(comuni_json)}")
print(f"File aggiornati: {OUT.name}, {OUT_COMUNI.name}")
if avvisi:
    print()
    print("Avvisi:")
    for a in avvisi:
        print(a)
print()

try:
    from genera_miniature import genera
    genera()
except Exception as e:
    print(f"ATTENZIONE: miniature non create ({e})")
