# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build arguments for environment variables
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ENVIRONMENT
ARG NODE_ENV=production

# Set environment variables for build
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT
ENV NODE_ENV=$NODE_ENV

# Build the Next.js application (only in production)
RUN if [ "$NODE_ENV" = "production" ]; then npm run build; fi

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application (dev mode if NODE_ENV=development, prod otherwise)
CMD if [ "$NODE_ENV" = "development" ]; then npm run dev; else npm start; fi
