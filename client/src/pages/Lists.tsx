import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Plus, Trash2, CheckCircle2, Circle, ListTodo, X, Sparkles, Edit2, Check, MapPin } from 'lucide-react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc-client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';

export default function Lists() {
  const [, navigate] = useLocation();
  const { t } = useLanguage();
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newItemContent, setNewItemContent] = useState('');
  const [isAddingList, setIsAddingList] = useState(false);
  
  // Editing state
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editingListName, setEditingListName] = useState('');
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItemContent, setEditingItemContent] = useState('');

  const utils = trpc.useUtils();

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
      toast.success(t('lists_toast_created'));
    },
    onError: (err) => toast.error(err.message || t('calendar_toast_error'))
  });

  const addItemMutation = trpc.list.addItem.useMutation({
    onSuccess: () => {
      utils.list.items.invalidate({ listId: selectedListId! });
      setNewItemContent('');
    },
    onError: (err) => toast.error(err.message || t('calendar_toast_error'))
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
      toast.success(t('lists_toast_deleted'));
    }
  });

  const updateListMutation = trpc.list.updateList.useMutation({
    onSuccess: () => {
      utils.list.all.invalidate();
      setEditingListId(null);
      toast.success(t('lists_toast_renamed'));
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
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={() => selectedListId ? setSelectedListId(null) : navigate("/")}
          className="rounded-full bg-card backdrop-blur-md shadow-sm"
        >
          <ChevronLeft />
        </Button>
        <div className="flex-1">
          {selectedListId && editingListId === selectedListId ? (
            <form onSubmit={handleUpdateList} className="flex items-center gap-2">
              <Input
                autoFocus
                value={editingListName}
                onChange={(e) => setEditingListName(e.target.value)}
                onBlur={() => setEditingListId(null)}
                className="h-9 border-0 border-b border-primary/30 bg-transparent px-0 text-xl font-bold tracking-tight shadow-none focus-visible:ring-0"
              />
              <Button type="submit" variant="ghost" size="icon-sm" className="text-primary">
                <Check />
              </Button>
            </form>
          ) : (
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 group">
              {selectedListId ? selectedList?.name : t('lists_main_title')}
              {selectedListId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => startEditingList(e, selectedList)}
                  className="rounded-full text-primary/60 hover:bg-primary/10"
                  title="Rename list"
                >
                  <Edit2 />
                </Button>
              )}
            </h1>
          )}
          {!selectedListId && <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">{t('lists_collections')}</p>}
        </div>
        {!selectedListId && (
          <Button
            type="button"
            size="icon-lg"
            onClick={() => setIsAddingList(true)}
            className="rounded-full shadow-lg shadow-primary/20 hover:scale-105 active:scale-95"
          >
            <Plus />
          </Button>
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
                    <form onSubmit={handleAddList} className="flex w-full flex-col gap-4">
                      <Input
                        autoFocus
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        placeholder={t('lists_placeholder_name')}
                        className="h-11 border-0 bg-transparent text-center text-lg font-bold shadow-none placeholder:text-muted-foreground/40 focus-visible:ring-0"
                      />
                      <div className="flex gap-2 justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setIsAddingList(false)}
                          className="rounded-full text-xs font-bold uppercase tracking-widest text-muted-foreground"
                        >
                          {t('lists_cancel')}
                        </Button>
                        <Button
                          type="submit"
                          className="rounded-full text-xs font-bold uppercase tracking-widest shadow-lg shadow-primary/10"
                        >
                          {t('lists_create')}
                        </Button>
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
                    className="bg-card backdrop-blur-xl border border-border rounded-3xl p-6 shadow-lg group hover:border-primary/30 transition-all cursor-pointer relative overflow-hidden hover:shadow-[0_0_30px_-5px_rgba(181,101,29,0.3)] dark:hover:shadow-[0_0_40px_-10px_rgba(245,158,11,0.2)]"
                    style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E')", backgroundBlendMode: "overlay" }}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/20 transition-all" />
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <ListTodo className="size-5" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        {editingListId === list.id ? (
                          <form onSubmit={handleUpdateList} onClick={(e) => e.stopPropagation()}>
                            <Input
                              autoFocus
                              value={editingListName}
                              onChange={(e) => setEditingListName(e.target.value)}
                              className="h-9 border-0 border-b border-primary bg-transparent px-0 text-lg font-bold shadow-none focus-visible:ring-0"
                              onBlur={() => setEditingListId(null)}
                            />
                          </form>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-lg truncate">{list.name}</h3>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={(e) => startEditingList(e, list)}
                              className="rounded-full text-primary/40 opacity-40 hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
                            >
                              <Edit2 />
                            </Button>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground font-medium">{new Date(list.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-primary">{t('card_calendar_open')} →</p>
                  </motion.div>
                ))}

                {allLists.data?.length === 0 && !isAddingList && (
                  <Empty className="col-span-full py-20">
                    <EmptyHeader>
                      <EmptyMedia variant="icon" className="size-20 rounded-full bg-accent/5 text-muted-foreground/30">
                        <ListTodo />
                      </EmptyMedia>
                      <EmptyTitle className="text-muted-foreground/60">{t('lists_empty_title')}</EmptyTitle>
                      <EmptyDescription className="text-muted-foreground/40">{t('lists_empty_desc')}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="item-view"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-6"
              >
                {/* List Control Header */}
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t('lists_manage')}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      if (confirm(t('lists_delete_confirm').replace('{name}', selectedList?.name || ''))) {
                        deleteListMutation.mutate({ listId: selectedListId });
                      }
                    }}
                    className="rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>

                {/* Add Item Form */}
                <form onSubmit={handleAddItem} className="relative group">
                  <div className="absolute -inset-1 bg-primary/10 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition duration-700"></div>
                  <InputGroup className="relative h-14 rounded-2xl bg-card px-2 shadow-xl">
                    <InputGroupInput
                      autoFocus
                      value={newItemContent}
                      onChange={(e) => setNewItemContent(e.target.value)}
                      placeholder={t('lists_placeholder_item')}
                      className="text-[15px] placeholder:text-muted-foreground/40"
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        type="submit"
                        variant="default"
                        size="icon-sm"
                        disabled={!newItemContent.trim()}
                        className="rounded-full shadow-lg shadow-primary/20 disabled:scale-95"
                      >
                        <Plus />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </form>

                {/* Items List */}
                <div className="flex flex-col gap-2">
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => toggleItemMutation.mutate({ itemId: item.id, completed: !item.completed })}
                        className={cn(
                          "size-6 shrink-0 rounded-full",
                          item.completed ? "text-primary bg-primary/10" : "text-muted-foreground/30 hover:text-primary hover:bg-primary/5"
                        )}
                      >
                        {item.completed ? <CheckCircle2 /> : <Circle />}
                      </Button>
                      
                      <div className="flex-1 min-w-0">
                        {editingItemId === item.id ? (
                          <form onSubmit={handleUpdateItem} className="flex items-center gap-2">
                            <Input
                              autoFocus
                              value={editingItemContent}
                              onChange={(e) => setEditingItemContent(e.target.value)}
                              className="h-8 flex-1 border-0 border-b border-primary bg-transparent px-0 text-[15px] font-medium shadow-none focus-visible:ring-0"
                              onBlur={() => setEditingItemId(null)}
                            />
                            <Button type="submit" variant="ghost" size="icon-sm" className="text-primary">
                              <Check />
                            </Button>
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
                                  <span>{t('calendar_reminder')}: {new Date(item.reminderAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                                </div>
                              )}
                              {(item as any).locationTrigger && !item.completed && (
                                <div className="flex items-center gap-1 text-[10px] text-amber-500 font-bold uppercase tracking-wider mt-0.5">
                                  <MapPin size={10} />
                                  <span>Trigger: At {(item as any).locationTrigger}</span>
                                </div>
                              )}
                            </div>
                            {!item.completed && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={(e) => startEditingItem(e, item)}
                                className="shrink-0 rounded-full text-primary/40 opacity-40 hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
                              >
                                <Edit2 />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteItemMutation.mutate({ itemId: item.id })}
                        className="rounded-full text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      >
                        <X />
                      </Button>
                    </motion.div>
                  ))}
                  
                  {listItems.data?.length === 0 && (
                    <Empty className="py-12">
                      <EmptyHeader>
                        <EmptyMedia variant="icon" className="bg-accent/5 text-muted-foreground/30">
                          <ListTodo />
                        </EmptyMedia>
                        <EmptyDescription className="italic text-muted-foreground/40">{t('lists_item_empty')}</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
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
