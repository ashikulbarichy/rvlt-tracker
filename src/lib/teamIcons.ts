import type { LucideIcon } from 'lucide-react';
import {
  Hexagon, Box, Layers, Code, Database, Server, Terminal, Cpu,
  Layout, Monitor, Smartphone, Globe, Cloud, Lock, Shield, Key,
  Briefcase, Building, Map, Compass, Target, Flag, Star, Heart,
  Zap, Flame, Droplet, Wind, Sun, Moon, CloudRain, Snowflake,
  Music, Video, Camera, Image, Book, File, FileText, Folder,
  Users, User, MessageSquare, MessageCircle, Mail, Phone, Bell,
  Activity, HeartPulse, Smile, Coffee, Package, Truck, ShoppingCart,
  Wrench, Hammer, Settings, Sliders, ToggleLeft, ToggleRight,
  CheckCircle, AlertCircle, Info, HelpCircle, PieChart, BarChart,
  TrendingUp, TrendingDown, List, Grid, Hash, AtSign, Link,
  Search, Command, PenTool, Edit, Paperclip, Scissors, Bookmark,
} from 'lucide-react';

/**
 * The icons a team can pick, by the name stored in `teams.icon`.
 *
 * Named imports on purpose. `import * as Icons from 'lucide-react'` looked the names up
 * dynamically and so pulled every one of lucide's ~1,800 icons into the entry bundle,
 * which every visitor downloaded before seeing the login page. ('Tool' was on the old
 * list but no longer exists in lucide; the picker already hid it.)
 */
export const TEAM_ICONS: Record<string, LucideIcon> = {
  Hexagon, Box, Layers, Code, Database, Server, Terminal, Cpu,
  Layout, Monitor, Smartphone, Globe, Cloud, Lock, Shield, Key,
  Briefcase, Building, Map, Compass, Target, Flag, Star, Heart,
  Zap, Flame, Droplet, Wind, Sun, Moon, CloudRain, Snowflake,
  Music, Video, Camera, Image, Book, File, FileText, Folder,
  Users, User, MessageSquare, MessageCircle, Mail, Phone, Bell,
  Activity, HeartPulse, Smile, Coffee, Package, Truck, ShoppingCart,
  Wrench, Hammer, Settings, Sliders, ToggleLeft, ToggleRight,
  CheckCircle, AlertCircle, Info, HelpCircle, PieChart, BarChart,
  TrendingUp, TrendingDown, List, Grid, Hash, AtSign, Link,
  Search, Command, PenTool, Edit, Paperclip, Scissors, Bookmark,
};

export const TEAM_ICON_NAMES = Object.keys(TEAM_ICONS);

/** The icon for a stored name, or the fallback for an empty or unknown one. */
export function teamIcon(name: string | null | undefined, fallback: LucideIcon = Hexagon): LucideIcon {
  return (name && TEAM_ICONS[name]) || fallback;
}
