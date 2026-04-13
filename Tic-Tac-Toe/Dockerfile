FROM heroiclabs/nakama:3.22.0

# Copy game modules and startup script
COPY server-data/modules /nakama/data/modules
COPY start-nakama.sh /nakama/start-nakama.sh

# Make script executable
RUN chmod +x /nakama/start-nakama.sh

# Expose HTTP port (Render needs this)
EXPOSE 7350

# Use startup script
CMD ["/nakama/start-nakama.sh"]
