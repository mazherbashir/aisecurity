package com.crs_reivew_api.component;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Component
public class TaskFileStore {

    private static final Logger logger = LoggerFactory.getLogger(TaskFileStore.class);
    private static final String HISTORY_FILE_NAME = "sctask-history.txt";

    private final File historyFile;

    public TaskFileStore() {
        this.historyFile = new File(HISTORY_FILE_NAME);
    }

    public TaskFileStore(File customFile) {
        this.historyFile = customFile;
    }

    /**
     * Reads the last maxEntries lines from sctask-history.txt.
     * Line format: "SCTASK30824068,2026-09-27T16:08:32Z" or "SCTASK30824068"
     *
     * @param maxEntries Maximum number of recent entries to read
     * @return List of String arrays where element 0 is sctaskNumber and element 1 is timestamp
     */
    public synchronized List<String[]> readLastEntries(int maxEntries) {
        List<String[]> entries = new ArrayList<>();
        if (!historyFile.exists() || !historyFile.canRead()) {
            logger.info("Task history file {} does not exist yet. Starting with clean state.", historyFile.getAbsolutePath());
            return entries;
        }

        try {
            List<String> allLines = Files.readAllLines(historyFile.toPath(), StandardCharsets.UTF_8);
            int start = Math.max(0, allLines.size() - maxEntries);
            for (int i = start; i < allLines.size(); i++) {
                String line = allLines.get(i).trim();
                if (line.isEmpty()) continue;

                String[] parts = line.split(",", 2);
                String taskNum = parts[0].trim();
                String ts = (parts.length > 1 && !parts[1].trim().isEmpty()) ? parts[1].trim() : Instant.now().toString();

                if (!taskNum.isEmpty()) {
                    entries.add(new String[]{taskNum, ts});
                }
            }
            logger.info("Successfully loaded {} history entries from {}", entries.size(), historyFile.getAbsolutePath());
        } catch (IOException e) {
            logger.error("Failed to read task history file {}: {}", historyFile.getAbsolutePath(), e.getMessage(), e);
        }

        return entries;
    }

    /**
     * Appends a single SCTASK entry to sctask-history.txt.
     */
    public synchronized void appendEntry(String sctaskNumber, String timestamp) {
        if (sctaskNumber == null || sctaskNumber.trim().isEmpty()) {
            return;
        }

        String ts = (timestamp != null && !timestamp.trim().isEmpty()) ? timestamp.trim() : Instant.now().toString();
        String line = sctaskNumber.trim() + "," + ts + System.lineSeparator();

        try {
            Files.writeString(
                    historyFile.toPath(),
                    line,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.APPEND
            );
            logger.debug("Appended task {} to history file {}", sctaskNumber, historyFile.getAbsolutePath());
        } catch (IOException e) {
            logger.error("Failed to append task {} to history file {}: {}", sctaskNumber, historyFile.getAbsolutePath(), e.getMessage(), e);
        }
    }

    public File getHistoryFile() {
        return historyFile;
    }
}
