# Secouristes du Sud — Application de gestion DPS

Application web de gestion des dispositifs prévisionnels de secours.

## Stack technique
- **Backend** : Node.js + Express
- **Base de données** : Supabase (PostgreSQL)
- **Frontend** : HTML/CSS/JS (PWA installable)
- **PDF** : Puppeteer
- **Hébergement** : Railway

## Variables d'environnement requises

```
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre-clé-anon
PORT=3000
```

## Déploiement sur Railway

1. Connecter ce repo GitHub à Railway
2. Ajouter les variables d'environnement dans Railway
3. Railway déploie automatiquement

## Fonctionnalités
- Gestion des événements (taurin, musical, sportif...)
- Déclaration de disponibilités par les bénévoles
- Planning et affectations par l'administrateur
- Génération d'ordres de mission en PDF
- Gestion des membres et qualifications (PSE1, PSE2, Conducteur...)
- Gestion des véhicules (VPSP 1/2/3/4 + VL Logistique)
- Application installable sur mobile (PWA)
