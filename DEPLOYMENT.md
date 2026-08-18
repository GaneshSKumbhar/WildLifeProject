# Deploying EcoSentinel

This project is a FastAPI service that includes TensorFlow and YOLO model files. Deploy it as a Docker web service; it cannot run on a static host.

## Local Docker check

From the project root:

```powershell
docker build -t ecosentinel .
docker run --rm -p 8000:8000 ecosentinel
```

When the models have loaded, open `http://127.0.0.1:8000/healthz`. It should return `"status":"ready"`.

## Render deployment

1. Create or sign in to a Render account and choose **New +** → **Web Service**.
2. Connect the GitHub repository `GaneshSKumbhar/WildLifeProject` and select the `main` branch.
3. Select **Docker** as the runtime. Render will use the root `Dockerfile` automatically.
4. Select a compute plan with enough memory for TensorFlow and the three inference models. The service starts only after all models load.
5. Set the health check path to `/healthz`, then create the service.
6. After Render reports a successful deploy, open the generated `https://<service>.onrender.com` URL.

Render provides the `PORT` environment variable automatically; the Docker command in this repository binds Uvicorn to it on `0.0.0.0`.

## Firebase setup required after deployment

The interface uses Firebase Authentication and Firestore. In the Firebase console, add the deployed host (for example, `your-service.onrender.com`) to **Authentication** → **Settings** → **Authorized domains**. Without this step, Google sign-in can be blocked on the deployed site.

## Updating the deployed service

With auto-deploy enabled in Render, each push to `main` triggers a new Docker build and deployment.
