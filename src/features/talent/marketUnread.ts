import { useEffect, useState } from 'react';
import { talentClient, talentRpc } from './liveTalent';
import type { Conversation } from './marketApi';

export function useUser(){const[id,setId]=useState('');useEffect(()=>{let alive=true;let client;try{client=talentClient();}catch{return;}void client.auth.getSession().then(({data})=>{if(alive)setId(data.session?.user.id??'');});const{data}=client.auth.onAuthStateChange((_event,session)=>setId(session?.user.id??''));return()=>{alive=false;data.subscription.unsubscribe();};},[]);return id;}
export function useMarketplaceUnread(){const user=useUser();const[count,setCount]=useState(0);useEffect(()=>{if(!user){setCount(0);return;}let alive=true;const update=()=>void talentRpc<Conversation[]>('market_conversations').then(rows=>{if(alive)setCount(rows.reduce((n,row)=>n+(row.unread_count||0),0));}).catch(()=>{});update();const channel=talentClient().channel(`market-unread-${user}`).on('postgres_changes',{event:'*',schema:'public',table:'market_inbox_events'},update).subscribe();const timer=window.setInterval(update,30000);return()=>{alive=false;clearInterval(timer);void talentClient().removeChannel(channel);};},[user]);return count;}
