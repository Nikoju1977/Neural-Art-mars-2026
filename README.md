# Neural Art V20.1 — Studio Niko

Atelier de peinture **gestuelle et tactile en 3D**, gratuit pour les fonctions artistiques de base, directement dans un navigateur moderne.

**Démo publique :** https://nikoju1977.github.io/Neural-Art-mars-2026/

## Fonctions intégrées

- Dessin tactile (Android/iPhone) et souris (PC/Mac), sans compte ni clé API.
- Caméra frontale optionnelle et reconnaissance d'une main via MediaPipe Hands.
- Geste **pouce-index rapprochés** pour dessiner ; doigts écartés pour déplacer la main sans tracer.
- Détection des mouvements : seuil de pincement relatif à la largeur de la paume, hystérésis pour limiter les faux déclenchements, lissage temporel et tolérance à la disparition brève de la main.
- Suivi visuel du doigt détecté (curseur cyan ; rose pendant le dessin), option caméra miroir et sensibilité ajustable.
- Rotation de la création avec la paume ouverte, optionnelle ; bouton de recentrage.
- Trois pinceaux : néon, sculpture, filament ; couleur libre, diamètre ajustable.
- Annulation du dernier tracé et effacement complet.
- Export de la scène 3D **GLTF (.gltf)** et capture de l'image **PNG**.
- Commandes vocales françaises compatibles avec Web Speech API (en fonction du navigateur).
- Assistant **Mistral optionnel**, par clé personnelle non conservée après fermeture de l'onglet.
- WebXR AR expérimental quand pris en charge par l'appareil et le navigateur.

## Utilisation

1. Ouvrir l'application. Le dessin au doigt ou à la souris fonctionne sans clé IA.
2. Pour peindre avec la main, cliquer sur **Activer la caméra** et accepter la permission.
3. Avancer la main devant la caméra frontale, rapprocher le pouce et l'index et déplacer la main.
4. Ajuster les paramètres sous **Détection et mouvements** si la caméra ne reconnaît pas bien le pincement.
5. Exporter avec **Image PNG** ou **Exporter 3D**.

## Technique et limites

- Code statique : `index.html`, `neural-v20.js`, `sw.js`, `manifest.json`, `icon.svg`.
- Bibliothèques externes : Three.js r128 et MediaPipe Hands. **Internet est nécessaire pour leur premier chargement.**
- La reconnaissance des mains dépend de l'éclairage, de la visibilité des doigts, du CPU/GPU et des autorisations caméra.
- La caméra est traitée dans le navigateur, sans envoi intentionnel du flux vidéo au backend de ce projet. Les dépendances externes sont récupérées via CDN.
- L'AR requiert WebXR immersive-ar ; cette fonction n'est pas universelle.
- Les appels Mistral facultatifs partent du navigateur vers l'API du prestataire et peuvent être facturés selon l'offre utilisateur. Ne jamais utiliser de clé d'administration partagée côté client.
- La taille d'une scène GLTF peut augmenter avec le nombre de tracés. Le moteur impose une limite pour éviter l'épuisement mémoire.
- **Validation :** syntaxe JavaScript et cohérence des identifiants UI contrôlées ; interface V20.1 retrouvée sur le site GitHub Pages. Le suivi caméra réel, l'AR et l'ensemble des exports doivent être testés sur appareils physiques.

## Exécution locale

```bash
python3 -m http.server 8000
```
Puis ouvrir http://localhost:8000/ dans un navigateur.

Projet : [Nikoju1977](https://github.com/Nikoju1977) — Studio Niko.
