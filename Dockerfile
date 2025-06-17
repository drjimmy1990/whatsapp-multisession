# Dockerfile: Self-Contained and Production-Ready for Coolify

# 1. Use the official Playwright base image.
# This guarantees that all system-level browser dependencies are present.
FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

# 2. Install the latest Node.js version (as of writing, v22 line).
# This follows the manual installation pattern you provided.
ARG NODE_VERSION=22.2.0
ARG NODE_ARCH=x64
RUN apt-get update && \
    apt-get install -y curl xz-utils && \
    curl -O https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz && \
    tar -xJf node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz -C /usr/local --strip-components=1 && \
    rm node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 3. Set the working directory for our application.
WORKDIR /app

# 4. Set the environment variable to make Puppeteer find the browser automatically.
# The Playwright image stores Chromium in a versioned folder inside /ms-playwright/.
# This command finds the correct path and sets it, so you don't have to.
ENV PUPPETEER_EXECUTABLE_PATH=$(find /ms-playwright/ -type f -name chrome-linux -printf "%p" -quit)

# 5. Copy package files to leverage Docker's layer caching.
COPY package*.json ./

# 6. Install ONLY production dependencies.
# This uses the --omit=dev flag as you requested for a lean node_modules folder.
RUN npm install --omit=dev

# 7. Copy the rest of the application source code.
COPY . .

# 8. Expose the port that our server runs on.
EXPOSE 5001

# 9. Define the command to start the application.
CMD ["node", "server.js"]