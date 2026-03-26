# 🇫🇮 Finnish B1.1 Vocabulary Trainer

A lightweight, exam-focused vocabulary app built with React + TypeScript + Vite.

## Features
- **Vocabulary List** — browse, search, filter by category/difficulty
- **Flashcards** — adaptive frequency (known words appear less)
- **Quiz Mode** — multiple choice with adaptive difficulty
- **Dark mode** + LocalStorage persistence

## Adding new words

Edit `src/vocab.json` and add entries in this format:
```json
{
  "word": "koira",
  "meaning": "dog",
  "example": "Minulla on koira.",
  "exampleTranslation": "I have a dog.",
  "category": "noun",
  "difficulty": "easy"
}
```

---

## Deploy to Vercel (3 steps)

### Step 1 — Push to GitHub

```bash
cd finnish-vocab-trainer
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

### Step 2 — Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Select your `finnish-vocab-trainer` repository
4. Vercel auto-detects Vite — just click **Deploy**

### Step 3 — Done! 🎉

Your app is live at `https://your-project.vercel.app`

---

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
