import { useEffect } from "react";
import { engine, useGameStore } from "./data/store";
import { World } from "./world/World";
import { HUD } from "./ui/HUD";
import { Inventory } from "./ui/Inventory";
import { TransactionModal } from "./ui/TransactionModal";
import { PromptModal } from "./ui/PromptModal";
import { ObjectCreator } from "./ui/ObjectCreator";
import { ApiReferenceModal } from "./ui/ApiReferenceModal";
import { ContextMenu } from "./ui/ContextMenu";
import { MachineInventoryModal } from "./ui/MachineInventoryModal";
import "./App.css";

function App() {
  const view = useGameStore((s) => s.view);
  const editingDefId = useGameStore((s) => s.editingDefId);

  useEffect(() => {
    // on_player_enter for the player's starting house (and any house they later walk into)
    // fires from PlayerMesh's house-crossing detection instead of a one-shot mount effect.
    const tickInterval = setInterval(() => {
      void engine.tickAll();
    }, 3000);
    return () => clearInterval(tickInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <World />
      <HUD />
      <Inventory />
      <TransactionModal />
      <PromptModal />
      <ApiReferenceModal />
      <ContextMenu />
      <MachineInventoryModal />
      {view === "editor" && editingDefId && <ObjectCreator />}
    </div>
  );
}

export default App;
