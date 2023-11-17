# Use the official lightweight Node.js 16 image.
FROM node:18-alpine

# Create a directory to hold the application code inside the image
WORKDIR /app

# Install app dependencies by copying
# package.json and package-lock.json files
COPY package*.json /app

# If you are building your code for production
# RUN npm ci --only=production
RUN npm install

# Bundle app source inside Docker image
COPY . /app

RUN npm run build

# Your app binds to port 3000 so you'll use the EXPOSE instruction to have it mapped by the docker daemon
EXPOSE 3000

# Define the command to run your app using CMD which defines your runtime
CMD ["npm", "start"]
