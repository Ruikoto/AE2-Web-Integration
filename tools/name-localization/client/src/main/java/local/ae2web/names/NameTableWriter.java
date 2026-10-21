package local.ae2web.names;

import java.io.IOException;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/** Detached strings only. Never opens world, server config, inventory or network files. */
public final class NameTableWriter {
    public static final String TARGET = "1.2.0-pre-forge-1.20.1";
    public static final String CONTRACT = "ae2wi-" + TARGET;
    private final Map<String, Entry> entries = new TreeMap<>();
    private final Set<String> ambiguous = new HashSet<>();
    private int skipped;

    public record Entry(String key, String itemid, String name) {}

    public void add(String key, String itemid, String name) {
        if (key == null || !key.matches("[A-Za-z0-9_-]{21}[AQgw]") || itemid == null
            || !itemid.matches("[a-z0-9_.-]+:[a-z0-9_./-]+") || itemid.length() > 512
            || name == null || name.isBlank() || name.length() > 1024
            || name.codePoints().anyMatch(c -> c < 32 || c == 127 || c >= 0xD800 && c <= 0xDFFF)) {
            skipped++;
            return;
        }
        if (ambiguous.contains(key)) return;
        if (!entries.containsKey(key) && entries.size() + ambiguous.size() >= 250000) {
            skipped++;
            return;
        }
        Entry value = new Entry(key, itemid, name);
        Entry previous = entries.putIfAbsent(key, value);
        if (previous != null && !previous.equals(value)) {
            // Uncertain identity/name collisions have no exported translation.
            entries.remove(key);
            ambiguous.add(key);
        }
    }

    public void skipped() { skipped++; }
    public int size() { return entries.size(); }

    public Path write(Path gameDirectory, String language, String scope) throws IOException {
        if (!language.equalsIgnoreCase("zh_cn")) throw new IOException("Select Simplified Chinese before exporting");
        if (entries.isEmpty()) throw new IOException("No names collected; nothing was written");
        Path directory = gameDirectory.resolve("ae2webnames");
        Files.createDirectories(directory);
        Path temporary = Files.createTempFile(directory, "names-", ".tmp");
        Path destination = temporary.resolveSibling(temporary.getFileName().toString().replace(".tmp", ".json"));
        try {
            JsonObject root = new JsonObject();
            root.addProperty("formatVersion", 1);
            root.addProperty("targetMod", TARGET);
            root.addProperty("identityContract", CONTRACT);
            root.addProperty("minecraftVersion", "1.20.1");
            root.addProperty("language", language);
            root.addProperty("scope", scope);
            root.addProperty("generatedAt", Instant.now().toString());
            root.addProperty("skipped", skipped);
            root.addProperty("ambiguous", ambiguous.size());
            JsonArray values = new JsonArray();
            for (Entry entry : entries.values()) {
                JsonObject value = new JsonObject();
                value.addProperty("key", entry.key());
                value.addProperty("itemid", entry.itemid());
                value.addProperty("name", entry.name());
                values.add(value);
            }
            root.add("entries", values);
            try (Writer output = Files.newBufferedWriter(temporary, StandardCharsets.UTF_8)) {
                new Gson().toJson(root, output);
            }
            if (Files.size(temporary) > 32L * 1024 * 1024) throw new IOException("Name table exceeds 32 MiB");
            try {
                Files.move(temporary, destination, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException unsupported) {
                Files.move(temporary, destination);
            }
            return destination;
        } finally {
            Files.deleteIfExists(temporary);
        }
    }
}
