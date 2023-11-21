# Use the official Python image that includes all dependencies
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# Copy the dependencies file to the working directory
COPY requirements.txt .

# Install any dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the content of the local src directory to the working directory
COPY . .

# Declare the port number the container should expose
EXPOSE 3001

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3001"]
