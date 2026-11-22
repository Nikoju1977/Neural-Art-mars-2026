# Neural Art V22.1 — Studio Niko

Atelier de création **tactile et gestuelle 3D**, dédié aussi à la **scénographie live, aux visuels de DJ sets, aux projections et aux films expérimentaux**. Application web gratuite pour le dessin, les motifs procéduraux et l’animation audio locale, sans compte.

## Nouveautés V22.1 — Deux mains et cordes musicales

**Peinture simultanée à deux doigts ou deux mains** : la zone tactile utilise plusieurs pointeurs indépendants. La caméra MediaPipe est configurée pour suivre deux mains ; chaque pincement pouce-index peut peindre de son côté, avec deux curseurs de couleurs distinctes. Les résultats de suivi dépendent de l’appareil et des conditions d’éclairage.

**Gomme tactile** : sélectionner « Gomme », puis toucher un trait de sculpture pour supprimer **le trait entier**. « Annuler » le restaure tant qu’aucune autre action d’historique ne l’a remplacé. « Tout effacer » demande confirmation et supprime l’œuvre 3D. La suppression partielle d’une portion de trait n’est pas encore implémentée.

**Instrument à cordes** : sélectionner « Cordes » dans la barre d’outils, puis :

1. En mode **Tendre**, faire glisser un doigt entre les deux extrémités d’une nouvelle corde.
2. En mode **Jouer**, passer un doigt (ou plusieurs) à travers les cordes pour les pincer. Une main peut maintenir un point d’ancrage tandis que l’autre joue.
3. En mode **Accorder**, déplacer une extrémité pour allonger ou raccourcir la corde. Ajuster également la tension, le timbre et le volume.
4. En mode **Gomme**, toucher une corde pour la retirer ; une confirmation permet d’effacer tout l’instrument.

La hauteur est calculée à partir de la longueur relative de la corde et de sa tension selon un modèle de corde idéale (la fréquence diminue quand la longueur augmente). Le son synthétique est produit dans le navigateur par un algorithme Karplus–Strong. Jusqu’à 18 cordes. Pas d’enregistrement audio dédié à ce module pour l’instant. Un mode de démonstration construit une harpe à six cordes.

**Autres outils de création** : la barre Pinceau / Gomme / Cordes / Annuler / Tout effacer reste accessible sur mobile et ordinateur. Les compositions procédurales incluent désormais Vortex, Fleur 3D, Orbites, Spirale, Galaxie, Ondes, Cœur et Rosace.

**Limites connues** : un navigateur doit autoriser le démarrage de l’audio à la suite d’un geste utilisateur ; cliquer « Cordes » peut servir à l’activer. Sur Safari iOS, les API de capture vidéo et de plein écran natif restent variables. Le suivi simultané à deux mains, les gestes et le son doivent être validés sur appareils réels.

## Pourquoi utiliser Neural Art ?

- **Créer des visuels live pour un DJ set** : charger un MP3, un WAV ou autre format audio pris en charge par le navigateur, puis activer le mode « Plein écran · Performance visuelle ». Les sculptures lumineuses pulsent selon les fréquences mesurées localement et peuvent tourner automatiquement.
- **Fabriquer un décor de clip ou une projection** : réaliser des tracés au doigt ou par gestes caméra, ou générer les compositions procédurales « Vortex », « Fleur 3D » et « Orbites ».
- **Exporter pour la post-production** : captures PNG, objets GLTF, projets BIN, et capture vidéo jusqu’à deux minutes si MediaRecorder / captureStream et un codec adapté sont disponibles.
- **Créer sur mobile** : iOS Safari utilise un mode immersif qui masque les panneaux de l’application lorsque le vrai plein écran du navigateur n’est pas disponible. Les barres système peuvent rester visibles.

La fonction « compositions procédurales » est algorithmique : ce n’est pas un modèle de génération d’image ou de vidéo par IA.

**Démo publique :** https://nikoju1977.github.io/Neural-Art-mars-2026/

## Fonctions intégrées

- Dessin tactile (Android/iPhone) et souris (PC/Mac), sans compte ni clé API.
- Mode scène immersif avec commandes de sortie, pinceaux accessibles via retour à l’atelier, annulation et capture PNG.
- Animations audio-réactives via un fichier musical choisi sur l’appareil : pas d’upload et analyse par Web Audio API.
- Compositions 3D procédurales, avec profondeur et couleur, pouvant être ajoutées à une œuvre existante.
- Enregistrement vidéo facultatif via les API natives du navigateur, avec lien de téléchargement conservé après sortie du plein écran.
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

**Performance visuelle :** créer une forme avec les presets, charger un morceau dans « Scénographie, compositions et musique », puis ouvrir le mode plein écran. La barre flottante permet de jouer/pause, générer une composition, annuler, prendre une photo PNG et lancer/arrêter une capture vidéo si le navigateur le permet. Le clip sauvegardé est également disponible depuis le panneau de scénographie après avoir quitté le plein écran.


1. Ouvrir l'application. Le dessin au doigt ou à la souris fonctionne sans clé IA.
2. Pour peindre avec la main, cliquer sur **Activer la caméra** et accepter la permission.
3. Avancer la main devant la caméra frontale, rapprocher le pouce et l'index et déplacer la main.
4. Ajuster les paramètres sous **Détection et mouvements** si la caméra ne reconnaît pas bien le pincement.
5. Exporter avec **Image PNG** ou **Exporter 3D**.

## Technique et limites

- Code statique : `index.html`, `neural-v20.js`, `performance-v21.js`, `strings-v22.js`, `sw.js`, `manifest.json`, `icon.svg`.
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
