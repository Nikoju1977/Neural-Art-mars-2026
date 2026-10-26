# 🧠 Neural Art — Mars 2026

## Ce que fait l'application, en pratique

L'atelier **Neural Art** explore la **création d'images dans le navigateur** à l'aide de pinceaux numériques, de calques et d'effets graphiques Canvas/WebGL. Il sert à expérimenter des compositions et des rendus puis à utiliser les possibilités d'export décrites par l'interface.

**Statut :** laboratoire créatif. Les fonctions présentées dans la documentation sont à essayer selon le navigateur et le matériel ; aucune qualité de rendu ou accélération IA mesurée n'est garantie.

**Studio Niko Design** — Moteur de création artistique neurale.

> Application de peinture numérique IA avec système de brosses avancé et rendu WebGL.

## ✨ Fonctionnalités
- 10 brosses IA avec physique de ressort (innovation Niko)
- Aberration chromatique WebGL
- Moteur de calques 16 modes de fusion
- Export SVG/PNG

## 🛠 Stack
`HTML` · `Canvas API` · `WebGL` · `MediaPipe`

## 👤 Auteur
**Nicolas Julienne** — [Studio Niko Design](https://github.com/Nikoju1977)
📧 nicolasjulienne.nj@gmail.com

---

## Exécution locale et limites

Le projet est fourni principalement dans `index.html`, avec `icon.svg` et `manifest.json`. Pour une exploration dans le navigateur :

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000/. Les fonctions de rendu dépendent de la compatibilité Canvas/WebGL du navigateur et, le cas échéant, de ressources supplémentaires. Les caractéristiques annoncées ci-dessus ne constituent pas un benchmark de performances.

**Statut :** prototype artistique ; compatibilité matérielle, exports et stabilité à tester sur les navigateurs et écrans cibles.

[Catalogue des projets Studio Niko Design](https://github.com/Nikoju1977).
