import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Expose all REACT_APP_ variables + NODE_ENV as process.env.*
  const processEnv = {};
  Object.keys(env).forEach((key) => {
    if (key.startsWith('REACT_APP_')) {
      processEnv[`process.env.${key}`] = JSON.stringify(env[key]);
    }
  });
  processEnv['process.env.NODE_ENV'] = JSON.stringify(mode);

  return {
    plugins: [react()],
    define: {
      // Polyfill process.env for CRA-style code
      'process.env': JSON.stringify(
        Object.fromEntries(
          Object.entries(env).filter(([k]) => k.startsWith('REACT_APP_'))
        )
      ),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    server: {
      port: 3000,
      open: false,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://localhost:5000',
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'build',
    },
    // Treat .js files with JSX as JSX
    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.[jt]sx?$/,
      exclude: [],
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
      },
    },
  };
});
