import { useEffect } from "react";
import { engine, useGameStore } from "./data/store";
import { World } from "./world/World";
import { HUD } from "./ui/HUD";
import { Inventory } from "./ui/Inventory";
import { TransactionModal } from "./ui/TransactionModal";
import { PromptModal } from "./ui/PromptModal";
import { ObjectCreator } from "./ui/ObjectCreator";
import { ApiReferenceModal } from "./ui/ApiReferenceModal";
import "./App.css";

function App() {
  const view = useGameStore((s) => s.view);
  const editingDefId = useGameStore((s) => s.editingDefId);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);

  useEffect(() => {
    const player = engine.getPlayer(currentPlayerId);
    if (player) void engine.enterHouse(currentPlayerId, player.houseId);

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
      {view === "editor" && editingDefId && <ObjectCreator />}
    </div>
  );
}

export default App;
