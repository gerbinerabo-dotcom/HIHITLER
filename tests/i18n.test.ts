import { describe, expect, it } from 'vitest';
import { languages, translate } from '../src/i18n.js';

describe('interface languages',()=>{
  it('provides all requested languages and localizes core navigation',()=>{
    expect(languages).toEqual(['ru','kk','ky','en','fr','de']);
    for(const language of languages){
      expect(translate(language,'menu_tasks')).not.toBe('menu_tasks');
      expect(translate(language,'menu_support')).not.toBe('menu_support');
      expect(translate(language,'settingsCurrency')).not.toBe('settingsCurrency');
    }
  });
  it('fills progress placeholders and explains a non-resetting habit goal',()=>{
    expect(translate('en','habitProgress',{name:'Reading',done:2,target:90,total:4})).toContain('2/90');
    for(const language of languages)expect(translate(language,'habitIntro')).toMatch(/90/);
  });
});
