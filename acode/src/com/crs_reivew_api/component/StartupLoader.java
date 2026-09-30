package com.crs_reivew_api.component;

import com.crs_reivew_api.config.VeracodeConfig;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class StartupLoader {

    private static final Logger logger = LoggerFactory.getLogger(StartupLoader.class);

    private final TaskMemory taskMemory;
    private final TaskFileStore taskFileStore;
    private final VeracodeConfig config;

    public StartupLoader(TaskMemory taskMemory, TaskFileStore taskFileStore, VeracodeConfig config) {
        this.taskMemory = taskMemory;
        this.taskFileStore = taskFileStore;
        this.config = config;
    }

    @PostConstruct
    public void init() {
        int maxEntries = config.getSnowSchedulerMaxMemoryEntries();
        logger.info("Initializing TaskMemory from local file store on application startup (max {} entries)...", maxEntries);

        List<String[]> pastEntries = taskFileStore.readLastEntries(maxEntries);
        for (String[] entry : pastEntries) {
            String taskNum = entry[0];
            String timestamp = entry[1];
            taskMemory.put(taskNum, timestamp);
        }

        logger.info("Startup initialization complete. Loaded {} entries into TaskMemory LRU store.", taskMemory.size());
    }
}
