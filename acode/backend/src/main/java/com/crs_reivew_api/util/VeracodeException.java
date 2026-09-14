package com.crs_reivew_api.util;

import java.util.List;

public class VeracodeException extends RuntimeException {
    private final String type;
    private final List<String> suggestions;

    public VeracodeException(String message, String type) {
        this(message, type, null);
    }

    public VeracodeException(String message, String type, List<String> suggestions) {
        super(message);
        this.type = type;
        this.suggestions = suggestions;
    }

    public String getType() {
        return type;
    }

    public List<String> getSuggestions() {
        return suggestions;
    }
}
