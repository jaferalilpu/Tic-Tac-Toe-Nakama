FROM heroiclabs/nakama:3.22.0

# Copy modules and script
COPY server-data/modules /nakama/data/modules
COPY start-nakama.sh /nakama/start-nakama.sh

# Make executable
RUN chmod +x /nakama/start-nakama.sh

# 🔥 OVERRIDE ENTRYPOINT (CRITICAL FIX)
ENTRYPOINT ["/nakama/start-nakama.sh"]

# Expose port
EXPOSE 7350