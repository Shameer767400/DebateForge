const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src', 'pages');

const filesToUpdate = fs.readdirSync(pagesDir).filter(f => f.endsWith('.jsx'));

for (const file of filesToUpdate) {
  if (file === 'LobbyPage.jsx') continue; // Already done

  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Skip if it doesn't use axios
  if (!content.includes('import axios from \'axios\';')) continue;
  
  // Public pages that don't need auth refresh
  const publicPages = ['LoginPage.jsx', 'RegisterPage.jsx', 'ForgotPasswordPage.jsx', 'ResetPasswordPage.jsx', 'VerifyEmailPage.jsx', 'VerifyEmailOTPPage.jsx'];
  if (publicPages.includes(file)) continue;

  console.log(`Updating ${file}...`);

  // Replace import
  content = content.replace("import axios from 'axios';", "import { useApi } from '../hooks/useApi';");
  
  // Need to inject `const api = useApi();` inside the component
  // Find the component function definition
  const componentRegex = /export default function (\w+)\((.*?)\) {/;
  const match = content.match(componentRegex);
  
  if (match) {
    const componentName = match[1];
    
    // Inject api declaration after component definition
    content = content.replace(
      match[0],
      `${match[0]}\n  const api = useApi();`
    );

    // Replace axios.get, axios.post, etc. with api.get, api.post
    // Also remove the `baseURL: process.env.REACT_APP_API_URL, withCredentials: true` options if they exist
    // This is tricky with regex, so we'll just replace `axios.` with `api.` 
    // The options object might still be there, but `api` instance ignores/overrides them safely since it already has them configured.
    content = content.replace(/axios\./g, 'api.');
    
    fs.writeFileSync(filePath, content);
    console.log(`   Updated ${file}`);
  }
}
