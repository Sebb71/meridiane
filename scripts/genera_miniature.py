"""Crea le versioni leggere delle foto per il sito.

  catalogo/foto/   originali (non vengono toccati)
  catalogo/thumbs/ miniature 400 px  -> elenchi
  catalogo/medie/  foto 1200 px      -> home e scheda

Si può eseguire da solo (python scripts/genera_miniature.py) ed è chiamato
automaticamente da calc_to_json.py. Rigenera solo le foto nuove o modificate.
Serve Pillow:  pip install pillow
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "catalogo" / "foto"
FORMATI = {
    "thumbs": 400,
    "medie": 1200,
}
ESTENSIONI = {".jpg", ".jpeg", ".png", ".webp"}


def genera():
    try:
        from PIL import Image, ImageOps
    except ImportError:
        print("ATTENZIONE: Pillow non installato, miniature non create.")
        print("            Installa con:  pip install pillow")
        return 0

    creati = 0
    for nome, lato in FORMATI.items():
        (ROOT / "catalogo" / nome).mkdir(parents=True, exist_ok=True)

    for foto in sorted(SRC.iterdir()):
        if foto.suffix.lower() not in ESTENSIONI:
            continue
        for nome, lato in FORMATI.items():
            dest = ROOT / "catalogo" / nome / (foto.stem + ".jpg")
            if dest.exists() and dest.stat().st_mtime >= foto.stat().st_mtime:
                continue
            with Image.open(foto) as im:
                im = ImageOps.exif_transpose(im)      # rispetta l'orientamento dello smartphone
                im = im.convert("RGB")
                im.thumbnail((lato, lato), Image.LANCZOS)  # non ingrandisce mai
                im.save(dest, "JPEG", quality=80, optimize=True, progressive=True)
            creati += 1
            print(f"  {nome}/{dest.name}  ({dest.stat().st_size // 1024} KB)")
    print(f"Miniature create/aggiornate: {creati}")
    return creati


if __name__ == "__main__":
    genera()
