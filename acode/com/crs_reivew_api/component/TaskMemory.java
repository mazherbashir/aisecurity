package com.crs_reivew_api.component;

import com.crs_reivew_api.config.VeracodeConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class TaskMemory {

    private static final Logger logger = LoggerFactory.getLogger(TaskMemory.class);

    private final int maxEntries;
    private final Map<String, String> lruMap;

    public TaskMemory(VeracodeConfig config) {
        this.maxEntries = config.getSnowSchedulerMaxMemoryEntries();
        Map<String, String> rawMap = new LinkedHashMap<String, String>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
                boolean shouldRemove = size() > maxEntries;
                if (shouldRemove) {
                    logger.debug("LRU TaskMemory limit reached (max {}). Evicting oldest entry: {}", maxEntries, eldest.getKey());
                }
                return shouldRemove;
            }
        };
        this.lruMap = Collections.synchronizedMap(rawMap);
        logger.info("Initialized TaskMemory LRU cache with max capacity: {}", maxEntries);
    }

    public synchronized boolean contains(String sctaskNumber) {
        if (sctaskNumber == null || sctaskNumber.trim().isEmpty()) {
            return false;
        }
        return lruMap.containsKey(sctaskNumber.trim());
    }

    public synchronized void put(String sctaskNumber, String timestamp) {
        if (sctaskNumber == null || sctaskNumber.trim().isEmpty()) {
            return;
        }
        String ts = (timestamp != null && !timestamp.trim().isEmpty()) ? timestamp.trim() : Instant.now().toString();
        lruMap.put(sctaskNumber.trim(), ts);
    }

    public synchronized Map<String, String> getSnapshot() {
        return new LinkedHashMap<>(lruMap);
    }

    public synchronized int size() {
        return lruMap.size();
    }

    public synchronized void clear() {
        lruMap.clear();
    }
}
