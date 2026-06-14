# AuditEase

AuditEase is a secure full-stack audit document management web application.

---

## 🚀 How to Install and Run

### 1. Install System Prerequisites (Node.js & SQLite)

Choose the commands for your Operating System:

* **Debian / Ubuntu**:
  ```bash
  sudo apt update && sudo apt install -y curl build-essential sqlite3
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt install -y nodejs
  ```
* **Fedora**:
  ```bash
  sudo dnf groupinstall -y "Development Tools"
  sudo dnf install -y nodejs sqlite
  ```
* **Arch Linux**:
  ```bash
  sudo pacman -Syu --needed base-devel nodejs npm sqlite
  ```
* **macOS**:
  ```bash
  brew install node
  ```
* **Windows**:
  Download and run the official [Node.js MSI installer](https://nodejs.org/). Make sure to check the box that automatically installs build tools for native modules.

---

### 2. Setup and Run the App

1. **Install NPM dependencies**:
   ```bash
   npm install
   ```
2. **Configure environment variables**:
   Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   ```
   Generate a cryptographically secure 64-character encryption key and place it under `ENCRYPTION_KEY` in `.env`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. **Start the server**:
   ```bash
   npm start
   ```
   The application will run at **`http://localhost:3000`**.

---

## 👥 User Management

AuditEase includes CLI scripts to manage accounts directly from the terminal.

### 1. List All Users
Display a directory of all registered users:
```bash
npm run list-users
```

### 2. Add a New User
Create a new user with a hashed password:
```bash
npm run add-user -- --name "John Doe" --username johndoe --password securepass123
```

### 3. Change a User's Password
Update the password of an existing user securely:
```bash
npm run change-password -- --username johndoe --password newsecurepass123
```

### 4. Delete a User
Remove a user from the system safely (fails if they have active document records linked to them):
```bash
npm run delete-user -- --username johndoe
```

---

## 🔒 Gitignore & Security
The following directory and local database files are ignored in [.gitignore](file:///home/ash/Projects/AuditEase/.gitignore) so they do not get shipped to production:
* `node_modules/` (dependencies)
* `.env` (secrets)
* `backend/storage/vault/*` (encrypted files)
* `auditease.db*` (SQLite databases and transaction logs)
