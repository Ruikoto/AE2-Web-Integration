package local.ae2web.names;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Iterator;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.Fluids;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.RegisterClientCommandsEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fluids.FluidStack;
import net.minecraftforge.fluids.FluidUtil;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.registries.ForgeRegistries;

import appeng.api.stacks.AEFluidKey;
import appeng.api.stacks.AEItemKey;
import appeng.api.stacks.AEKey;
import local.ae2web.names.identity.NativeItemIdentity;

/** Client commands and copied stacks only. No server handlers, packets, mixins or world writes. */
@Mod.EventBusSubscriber(modid = "ae2web_local_names", value = Dist.CLIENT)
public final class ClientCommands {
    private static Session active;

    private ClientCommands() {}

    @SubscribeEvent
    public static void register(RegisterClientCommandsEvent event) {
        event.getDispatcher().register(Commands.literal("ae2webnames")
            .then(Commands.literal("sample").executes(context -> start(false)))
            .then(Commands.literal("export")
                .executes(context -> say("Full export reads registries and creative tabs. Run /ae2webnames export confirm."))
                .then(Commands.literal("confirm").executes(context -> start(true))))
            .then(Commands.literal("cancel").executes(context -> {
                if (active != null && active.output != null) return say("Local file is being saved; please wait.");
                active = null;
                return say("Name collection cancelled; no file was written.");
            })));
    }

    private static int say(String message) {
        Minecraft minecraft = Minecraft.getInstance();
        if (minecraft.player != null) minecraft.player.displayClientMessage(Component.literal(message), false);
        return 1;
    }

    private static int start(boolean full) {
        Minecraft minecraft = Minecraft.getInstance();
        if (active != null) return say("An export is already active.");
        if (minecraft.level == null || minecraft.player == null) return say("Enter a client world first.");
        if (!"zh_cn".equalsIgnoreCase(minecraft.options.languageCode)) return say("Select Simplified Chinese first.");
        if (minecraft.getOverlay() != null) return say("Wait for resource loading to finish.");
        try {
            active = new Session(minecraft, full);
            return say("Collecting local names. No server request is sent. /ae2webnames cancel stops collection.");
        } catch (RuntimeException failure) {
            active = null;
            return say("Export could not start: " + failure.getClass().getSimpleName());
        }
    }

    @SubscribeEvent
    public static void tick(TickEvent.ClientTickEvent event) {
        if (event.phase != TickEvent.Phase.END || active == null) return;
        Minecraft minecraft = Minecraft.getInstance();
        Session session = active;
        if (session.output != null) {
            if (!session.output.isDone()) return;
            active = null;
            try { say("Exported " + session.writer.size() + " names: " + session.output.join()); }
            catch (CompletionException failure) { say("Local name file could not be written. No server files changed."); }
            return;
        }
        if (minecraft.level != session.world || minecraft.player == null
            || !session.language.equals(minecraft.options.languageCode) || minecraft.getOverlay() != null) {
            active = null;
            say("Export cancelled: world, language or resources changed. No file was written.");
            return;
        }
        try {
            long deadline = System.nanoTime() + 4_000_000L;
            for (int count = 0; count < 64 && System.nanoTime() < deadline; count++) {
                if (!session.next()) {
                    Path gameDirectory = minecraft.gameDirectory.toPath();
                    // Only detached strings reach the worker. A unique file is published on completion.
                    session.output = CompletableFuture.supplyAsync(() -> {
                        try { return session.writer.write(gameDirectory, session.language, session.scope); }
                        catch (IOException failure) { throw new CompletionException(failure); }
                    });
                    break;
                }
            }
        } catch (RuntimeException failure) {
            active = null;
            say("Name collection failed; no file was written: " + failure.getClass().getSimpleName());
        }
    }

    private static final class Session {
        final ClientLevel world;
        final String language;
        final String scope;
        final NameTableWriter writer = new NameTableWriter();
        final Deque<ItemStack> inventory = new ArrayDeque<>();
        Iterator<Item> items;
        Iterator<Fluid> fluids;
        Iterator<CreativeModeTab> tabs;
        Iterator<ItemStack> variants;
        CompletableFuture<Path> output;

        Session(Minecraft minecraft, boolean full) {
            world = minecraft.level;
            language = minecraft.options.languageCode;
            scope = full ? "registries-creative-inventory" : "inventory-sample";
            // Preserve inventory, counts, NBT and capabilities by working with detached copies.
            for (int slot = 0; slot < minecraft.player.getInventory().getContainerSize(); slot++) {
                ItemStack stack = minecraft.player.getInventory().getItem(slot);
                if (!stack.isEmpty()) inventory.add(stack.copy());
            }
            if (full) {
                CreativeModeTabs.tryRebuildTabContents(world.enabledFeatures(), false, world.registryAccess());
                items = ForgeRegistries.ITEMS.iterator();
                fluids = ForgeRegistries.FLUIDS.iterator();
                tabs = CreativeModeTabs.allTabs().iterator();
            }
        }

        boolean next() {
            if (!inventory.isEmpty()) {
                ItemStack copy = inventory.removeFirst();
                item(copy);
                FluidUtil.getFluidContained(copy.copy()).ifPresent(this::fluid);
                return true;
            }
            if (items != null && items.hasNext()) { item(items.next().getDefaultInstance().copy()); return true; }
            if (variants != null && variants.hasNext()) { item(variants.next().copy()); return true; }
            if (tabs != null && tabs.hasNext()) {
                // Search tabs include additional display variants on supported modded tabs.
                CreativeModeTab tab = tabs.next();
                variants = java.util.stream.Stream.concat(
                    tab.getDisplayItems().stream(), tab.getSearchTabDisplayItems().stream()).iterator();
                return true;
            }
            if (fluids != null && fluids.hasNext()) {
                Fluid value = fluids.next();
                if (value != Fluids.EMPTY) fluid(new FluidStack(value, 1));
                return true;
            }
            return false;
        }

        void item(ItemStack copy) {
            if (copy.isEmpty()) return;
            try {
                copy.setCount(1);
                AEItemKey key = AEItemKey.of(copy);
                if (key != null) add(key, copy.getHoverName().getString());
            } catch (RuntimeException unsupported) { writer.skipped(); }
        }

        void fluid(FluidStack copy) {
            if (copy.isEmpty()) return;
            try {
                AEFluidKey key = AEFluidKey.of(copy);
                if (key != null) add(key, copy.getDisplayName().getString());
            } catch (RuntimeException unsupported) { writer.skipped(); }
        }

        void add(AEKey key, String name) {
            // Exact released server algorithm: includes native type and full serialized NBT.
            writer.add(NativeItemIdentity.getKey(key).toString(), key.getId().toString(), name);
        }
    }
}
