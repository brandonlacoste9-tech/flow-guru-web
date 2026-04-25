import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Plus, Trash2, CheckCircle2, Circle, ListTodo, X, Sparkles, Edit2, Check } from 'lucide-react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc-client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Lists() {
  const [, navigate] = useLocation();
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newItemContent, setNewItemContent] = useState('');
  const [isAddingList, setIsAddingList] = useState(false);
  
  // Editing state
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editingListName, setEditingListName] = useState('');
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItemContent, setEditingItemContent] = useState('');

  const utils = trpc.useContext();

  const allLists = trpc.list.all.useQuery();
  const listItems = trpc.list.items.useQuery(
    { listId: selectedListId! },
    { enabled: selectedListId !== null }
  );

  const createListMutation = trpc.list.create.useMutation({
    onSuccess: () => {
      utils.list.all.invalidate();
      setNewListName('');
      setIsAddingList(false);
      toast.success('List created');
    }
  });

  const addItemMutation = trpc.list.addItem.useMutation({
    onSuccess: () => {
      utils.list.items.invalidate({ listId: selectedListId! });
      setNewItemContent('');
    }
  });

  const toggleItemMutation = trpc.list.toggleItem.useMutation({
    onSuccess: () => {
      utils.list.items.invalidate({ listId: selectedListId! });
    }
  });

  const deleteItemMutation = trpc.list.deleteItem.useMutation({
    onSuccess: () => {
      utils.list.items.invalidate({ listId: selectedListId! });
    }
  });

  const deleteListMutation = trpc.list.deleteList.useMutation({
    onSuccess: () => {
      utils.list.all.invalidate();
      setSelectedListId(null);
      toast.success('List deleted');
    }
  });

  const updateListMutation = trpc.list.updateList.useMutation({
    onSuccess: () => {
      utils.list.all.invalidate();
      setEditingListId(null);
      toast.success('List renamed');
    }
  });

  const updateItemMutation = trpc.list.updateItem.useMutation({
    onSuccess: () => {
      utils.list.items.invalidate({ listId: selectedListId! });
      setEditingItemId(null);
    }
  });

  const selectedList = allLists.data?.find(l => l.id === selectedListId);

  const handleAddList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    createListMutation.mutate({ name: newListName });
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemContent.trim() || selectedListId === null) return;
    addItemMutation.mutate({ listId: selectedListId, content: newItemContent });
  };

  const startEditingList = (e: React.MouseEvent, list: any) => {
    e.stopPropagation();
    setEditingListId(list.id);
    setEditingListName(list.name);
  };

  const handleUpdateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingListName.trim() || editingListId === null) return;
    updateListMutation.mutate({ listId: editingListId, name: editingListName });
  };

  const startEditingItem = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    setEditingItemId(item.id);
    setEditingItemContent(item.content);
  };

  const handleUpdateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItemContent.trim() || editingItemId === null) return;
    updateItemMutation.mutate({ itemId: editingItemId, content: editingItemContent });
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-['Outfit'] selection:bg-primary/30 overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
        <div
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-primary to-accent opacity-10 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          style={{
            clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)'
          }}
        />
      </div>

      {/* Header */}
      <header className="px-4 sm:px-6 pt-5 pb-3 flex items-center gap-4 z-50">
        <button 
          onClick={() => selectedListId ? setSelectedListId(null) : navigate("/")}
          className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-accent/10 transition-all shadow-sm"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          {selectedListId && editingListId === selectedListId ? (
            <form onSubmit={handleUpdateList} className="flex items-center gap-2">
              <input 
                autoFocus
                value={editingListName}
                onChange={(e) => setEditingListName(e.target.value)}
                onBlur={() => setEditingListId(null)}
                className="bg-transparent text-xl font-bold tracking-tight focus:outline-none border-b border-primary/30 w-full"
              />
              <button type="submit" className="p-2 text-primary"><Check size={18} /></button>
            </form>
          ) : (
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 group">
              {selectedListId ? selectedList?.name : "Your Lists"}
              {selectedListId && (
                <button 
                  onClick={(e) => startEditingList(e, selectedList)}
                  className="p-1.5 rounded-full hover:bg-primary/10 text-primary/60 transition-all flex items-center justify-center"
                  title="Rename list"
                >
                  <Edit2 size={14} />
                </button>
              )}
            </h1>
          )}
          {!selectedListId && <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Collections</p>}
        </div>
        {!selectedListId && (
          <button 
            onClick={() => setIsAddingList(true)}
            className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus size={20} />
          </button>
        )}
      </header>

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 pb-24 z-10 scrollbar-hide">
        <div className="max-w-2xl mx-auto py-6">
          <AnimatePresence mode="wait">
            {!selectedListId ? (
              <motion.div 
                key="list-grid"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                {isAddingList && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-card border-2 border-dashed border-primary/30 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 shadow-xl"
                  >
                    <form onSubmit={handleAddList} className="w-full space-y-4">
                      <input 
                        autoFocus
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        placeholder="List name (e.g. Groceries)"
                        className="w-full bg-transparent text-center text-lg font-bold placeholder:text-muted-foreground/40 focus:outline-none"
                      />
                      <div className="flex gap-2 justify-center">
                        <button 
                          type="button"
                          onClick={() => setIsAddingList(false)}
                          className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest text-muted-foreground hover:bg-accent/10"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit"
                          className="px-6 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest shadow-lg shadow-primary/10"
                        >
                          Create
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}

                {allLists.data?.map((list, idx) => (
                  <motion.div
                    key={list.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => setSelectedListId(list.id)}
                    className="bg-card backdrop-blur-xl border border-border rounded-3xl p-6 shadow-lg group hover:border-primary/30 transition-all cursor-pointer relative overflow-hidden"
                    style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E')", backgroundBlendMode: "overlay" }}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <ListTodo size={20} />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        {editingListId === list.id ? (
                          <form onSubmit={handleUpdateList} onClick={(e) => e.stopPropagation()}>
                            <input 
                              autoFocus
                              value={editingListName}
                              onChange={(e) => setEditingListName(e.target.value)}
                              className="bg-transparent font-bold text-lg focus:outline-none border-b border-primary w-full"
                              onBlur={() => setEditingListId(null)}
                            />
                          </form>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-lg truncate">{list.name}</h3>
                            <button 
                              onClick={(e) => startEditingList(e, list)}
                              className="opacity-40 group-hover:opacity-100 p-1.5 rounded-full hover:bg-primary/10 text-primary/40 hover:text-primary transition-all flex items-center justify-center"
                            >
                              <Edit2 size={12} />
                            </button>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground font-medium">{new Date(list.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-primary">View list →</p>
                  </motion.div>
                ))}

                {allLists.data?.length === 0 && !isAddingList && (
                  <div className="col-span-full py-20 text-center">
                    <div className="w-20 h-20 rounded-full bg-accent/5 flex items-center justify-center mx-auto mb-4">
                      <ListTodo size={32} className="text-muted-foreground/30" />
                    </div>
                    <h3 className="text-lg font-bold text-muted-foreground/60">No lists yet</h3>
                    <p className="text-sm text-muted-foreground/40 mt-1">Create your first collection to stay organized.</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="item-view"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {/* List Control Header */}
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Manage List</span>
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm(`Delete the entire "${selectedList?.name}" list?`)) {
                        deleteListMutation.mutate({ listId: selectedListId });
                      }
                    }}
                    className="p-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Add Item Form */}
                <form onSubmit={handleAddItem} className="relative group">
                  <div className="absolute -inset-1 bg-primary/10 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition duration-700"></div>
                  <div className="relative flex items-center gap-2 bg-card border border-border rounded-2xl px-4 py-3 shadow-xl">
                    <input 
                      autoFocus
                      value={newItemContent}
                      onChange={(e) => setNewItemContent(e.target.value)}
                      placeholder="Add an item..."
                      className="flex-1 bg-transparent text-[15px] focus:outline-none placeholder:text-muted-foreground/40"
                    />
                    <button 
                      type="submit"
                      disabled={!newItemContent.trim()}
                      className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 disabled:opacity-50 disabled:scale-95 transition-all"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </form>

                {/* Items List */}
                <div className="space-y-2">
                  {listItems.data?.map((item, idx) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className={cn(
                        "group flex items-center gap-3 bg-card border border-border/50 rounded-2xl px-4 py-3.5 transition-all",
                        item.completed ? "opacity-50" : "shadow-sm hover:border-primary/20"
                      )}
                    >
                      <button 
                        onClick={() => toggleItemMutation.mutate({ itemId: item.id, completed: !item.completed })}
                        className={cn(
                          "shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all",
                          item.completed ? "text-primary bg-primary/10" : "text-muted-foreground/30 hover:text-primary hover:bg-primary/5"
                        )}
                      >
                        {item.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        {editingItemId === item.id ? (
                          <form onSubmit={handleUpdateItem} className="flex items-center gap-2">
                            <input 
                              autoFocus
                              value={editingItemContent}
                              onChange={(e) => setEditingItemContent(e.target.value)}
                              className="flex-1 bg-transparent text-[15px] font-medium focus:outline-none border-b border-primary"
                              onBlur={() => setEditingItemId(null)}
                            />
                            <button type="submit" className="text-primary"><Check size={16} /></button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col flex-1 min-w-0">
                              <p 
                                className={cn(
                                  "text-[15px] font-medium transition-all truncate",
                                  item.completed && "line-through decoration-primary/30"
                                )}
                              >
                                {item.content}
                              </p>
                              {item.reminderAt && !item.completed && (
                                <div className="flex items-center gap-1 text-[10px] text-primary font-bold uppercase tracking-wider mt-0.5">
                                  <Sparkles size={10} />
                                  <span>Reminding: {new Date(item.reminderAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                                </div>
                              )}
                            </div>
                            {!item.completed && (
                              <button 
                                onClick={(e) => startEditingItem(e, item)}
                                className="opacity-40 group-hover:opacity-100 p-1.5 rounded-full hover:bg-primary/10 text-primary/40 hover:text-primary transition-all flex items-center justify-center shrink-0"
                              >
                                <Edit2 size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <button 
                        onClick={() => deleteItemMutation.mutate({ itemId: item.id })}
                        className="opacity-0 group-hover:opacity-100 p-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  ))}
                  
                  {listItems.data?.length === 0 && (
                    <div className="py-12 text-center">
                      <p className="text-sm text-muted-foreground/40 italic">This list is empty. Add something above!</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
