# Use the official lightweight Node.js 16 image.
FROM node:18-alpine

# Argument for specifying the package name
ARG PACKAGE_NAME

# Create a directory to hold the application code inside the image
WORKDIR /app

COPY tsconfig.base.json /app

RUN mkdir /app/packages
RUN mkdir /app/packages/shared
# Copy shared package.json and package-lock.json
COPY packages/shared/package*.json /app/packages/shared

# Install shared dependencies
RUN cd /app/packages/shared && npm install

# Copy the rest of the shared code and build it
COPY packages/shared /app/packages/shared
RUN cd /app/packages/shared && npm run build

# Bundle app source inside Docker image
COPY packages/$PACKAGE_NAME /app/packages/$PACKAGE_NAME

# Change to the consumer's package directory
WORKDIR /app/packages/$PACKAGE_NAME
# If you are building your code for production
# RUN npm ci --only=production
RUN npm install
RUN npm run build

# Your app binds to port 3000 so you'll use the EXPOSE instruction to have it mapped by the docker daemon
# NOTE: unnecessary for the consumers, simple setting for client_api
EXPOSE 3000

# Define the command to run your app using CMD which defines your runtime
CMD ["npm", "start"]
