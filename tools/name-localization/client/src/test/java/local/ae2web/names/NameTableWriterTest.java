package local.ae2web.names;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.function.Consumer;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.google.common.hash.PrimitiveSink;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import local.ae2web.names.identity.StableKey;

class NameTableWriterTest {
    private static final String KEY = "AAAAAAAAAAAAAAAAAAAAAA";
    @TempDir Path directory;

    @Test
    void namesRoundTripInUtf8AndOnlyNewFilesAreWritten() throws Exception {
        Path world = Files.createDirectories(directory.resolve("saves/world"));
        Path sentinel = world.resolve("level.dat");
        Files.writeString(sentinel, "untouched world");
        NameTableWriter writer = new NameTableWriter();
        writer.add(KEY, "minecraft:iron_ingot", "§a铁锭 & <铜>");
        Path first = writer.write(directory, "zh_cn", "inventory-sample");
        Path second = writer.write(directory, "zh_cn", "inventory-sample");
        assertNotEquals(first, second);
        assertEquals("untouched world", Files.readString(sentinel));
        assertEquals(directory.resolve("ae2webnames"), first.getParent());
        JsonObject root = JsonParser.parseString(Files.readString(first)).getAsJsonObject();
        assertEquals(NameTableWriter.TARGET, root.get("targetMod").getAsString());
        assertEquals(NameTableWriter.CONTRACT, root.get("identityContract").getAsString());
        assertEquals("§a铁锭 & <铜>", root.getAsJsonArray("entries").get(0).getAsJsonObject().get("name").getAsString());
        try (var files = Files.list(first.getParent())) {
            assertTrue(files.noneMatch(path -> path.toString().endsWith(".tmp")));
        }
    }

    @Test
    void exactDuplicateIsDeduplicatedButConflictsArePermanentlyExcluded() throws Exception {
        NameTableWriter writer = new NameTableWriter();
        writer.add(KEY, "test:iron", "铁");
        writer.add(KEY, "test:iron", "铁");
        assertEquals(1, writer.size());
        writer.add(KEY, "test:iron", "铜");
        writer.add(KEY, "test:iron", "铁");
        assertEquals(0, writer.size());
        writer.add("BBBBBBBBBBBBBBBBBBBBBA", "test:copper", "铜");
        JsonObject root = JsonParser.parseString(Files.readString(writer.write(directory, "zh_cn", "test"))).getAsJsonObject();
        assertEquals(1, root.get("ambiguous").getAsInt());
        assertEquals(1, root.getAsJsonArray("entries").size());
    }

    @Test
    void badKeysNamesAndRegistryIdsAreSkipped() {
        NameTableWriter writer = new NameTableWriter();
        writer.add("bad", "test:iron", "铁");
        writer.add(KEY, "bad id", "铁");
        writer.add(KEY, "test:iron", "\u0000name");
        writer.add(KEY, "test:iron", " ");
        writer.add(KEY, "test:iron", "铁".repeat(1025));
        writer.add(KEY, "test:iron", "\ud800");
        assertEquals(0, writer.size());
    }

    @Test
    void emptyAndWrongLanguageExportsWriteNothing() {
        NameTableWriter writer = new NameTableWriter();
        assertThrows(java.io.IOException.class, () -> writer.write(directory, "zh_cn", "test"));
        writer.add(KEY, "test:iron", "铁");
        assertThrows(java.io.IOException.class, () -> writer.write(directory, "en_us", "test"));
        assertFalse(Files.exists(directory.resolve("ae2webnames")));
    }

    @Test
    void stableKeysAgreeWithActualReleasedServerBinary() throws Exception {
        String jar = System.getProperty("releasedJar");
        Assumptions.assumeTrue(jar != null, "Supply -PreleasedJar=/path/to/official/server.jar for binary comparison");
        try (URLClassLoader loader = new URLClassLoader(new java.net.URL[]{Path.of(jar).toUri().toURL()}, getClass().getClassLoader())) {
            Class<?> released = loader.loadClass("pl.kuba6000.ae2webintegration.core.identity.StableKey");
            for (int variant = 0; variant < 256; variant++) {
                final int value = variant;
                Consumer<PrimitiveSink> encoding = sink -> {
                    sink.putInt(value).putLong(12345678901234L).putByte((byte) 1);
                    StableKey.writeText(sink, "中文 identity " + value);
                };
                Consumer<PrimitiveSink> releasedEncoding = sink -> {
                    sink.putInt(value).putLong(12345678901234L).putByte((byte) 1);
                    try { released.getMethod("writeText", PrimitiveSink.class, String.class)
                        .invoke(null, sink, "中文 identity " + value); }
                    catch (ReflectiveOperationException failure) { throw new IllegalStateException(failure); }
                };
                Object reference = released.getMethod("create", Consumer.class).invoke(null, releasedEncoding);
                assertEquals(reference.toString(), StableKey.create(encoding).toString());
            }
        }
    }
}
