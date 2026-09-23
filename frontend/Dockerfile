FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV VITE_PROXY_TARGET=http://backend:8000
EXPOSE 5173
# `vite preview` serves the production build and proxies /api and /mock to the FastAPI backend.
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
